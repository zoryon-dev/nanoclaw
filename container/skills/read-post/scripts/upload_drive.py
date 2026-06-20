#!/usr/bin/env python3
"""Upload carousel card images to Google Drive via the OneCLI gateway.

Runs inside the agent container. Makes plain HTTPS calls to googleapis.com with
NO Authorization header — the OneCLI gateway injects the Google Drive OAuth
token (the agent must have the `google-drive` app granted). Creates a subfolder
under a parent "Referências — Carrosséis" folder, uploads every image, makes the
subfolder link-readable, and prints the subfolder's shareable link to stdout.

Why a script (not the agent via Composio): keeps the upload deterministic and
OFF the agent's context — uploading N files through agent tool-calls overloads
the turn. The agent just runs this and reads the one link it prints.

Pure stdlib. TLS trusts the gateway CA via the container's SSL_CERT_FILE.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import sys
import urllib.error
import uuid
from pathlib import Path
from urllib.request import Request, urlopen


DRIVE_FILES = "https://www.googleapis.com/drive/v3/files"
DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name"
PARENT_FOLDER_NAME = "Referências — Conteúdo"
FOLDER_MIME = "application/vnd.google-apps.folder"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _api(method: str, url: str, *, body: bytes | None = None, content_type: str | None = None) -> dict:
    """One gateway-proxied googleapis.com call. No auth header — gateway injects.
    Raises SystemExit with the gateway/Drive error on failure."""
    headers = {"User-Agent": "read-post/1.0 (+nanoclaw)"}
    if content_type:
        headers["Content-Type"] = content_type
    req = Request(url, data=body, headers=headers, method=method)
    try:
        with urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")[:500]
        except Exception:
            pass
        if "access_restricted" in detail or "does not have access" in detail:
            raise SystemExit(
                "Google Drive is not granted to this agent in OneCLI. Ask the user to "
                "grant Drive access to this agent, then retry."
            )
        raise SystemExit(f"Drive API {method} {url.split('?')[0]} failed: HTTP {exc.code} {detail}")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise SystemExit(f"Drive API call failed (network): {exc}")
    return json.loads(raw) if raw.strip() else {}


def find_or_create_folder(name: str, parent_id: str | None = None) -> str:
    """Return the id of a folder named `name` (under parent_id), creating it if
    absent. With the drive.file scope, queries only see app-created files — fine,
    since the parent and subfolders are all created by this app."""
    q = f"name = '{name.replace(chr(39), chr(92)+chr(39))}' and mimeType = '{FOLDER_MIME}' and trashed = false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
    res = _api("GET", f"{DRIVE_FILES}?q={_urlq(q)}&fields=files(id,name)&pageSize=1")
    files = res.get("files") or []
    if files:
        return files[0]["id"]
    meta = {"name": name, "mimeType": FOLDER_MIME}
    if parent_id:
        meta["parents"] = [parent_id]
    created = _api("POST", f"{DRIVE_FILES}?fields=id",
                   body=json.dumps(meta).encode(), content_type="application/json")
    return created["id"]


def _urlq(s: str) -> str:
    from urllib.parse import quote
    return quote(s, safe="")


def upload_image(path: Path, folder_id: str) -> None:
    """Multipart upload one image into the folder."""
    boundary = f"----ReadPost{uuid.uuid4().hex}"
    meta = json.dumps({"name": path.name, "parents": [folder_id]}).encode()
    mimetype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    eol = b"\r\n"
    body = b"".join([
        f"--{boundary}".encode(), eol,
        b"Content-Type: application/json; charset=UTF-8", eol, eol,
        meta, eol,
        f"--{boundary}".encode(), eol,
        f"Content-Type: {mimetype}".encode(), eol, eol,
        path.read_bytes(), eol,
        f"--{boundary}--".encode(), eol,
    ])
    _api("POST", DRIVE_UPLOAD, body=body,
         content_type=f"multipart/related; boundary={boundary}")


def make_anyone_reader(file_id: str) -> None:
    """Grant 'anyone with the link' read access so the sheet link opens."""
    _api("POST", f"{DRIVE_FILES}/{file_id}/permissions",
         body=json.dumps({"role": "reader", "type": "anyone"}).encode(),
         content_type="application/json")


def main() -> int:
    ap = argparse.ArgumentParser(prog="upload_drive", description="Upload carousel cards to Google Drive.")
    ap.add_argument("cards_dir", help="Directory containing the card images")
    ap.add_argument("--name", required=True, help="Subfolder name, e.g. '2026-06-16 — @handle — SHORTCODE'")
    args = ap.parse_args()

    cards_dir = Path(args.cards_dir)
    images = sorted(p for p in cards_dir.iterdir()
                    if p.is_file() and p.suffix.lower() in IMAGE_EXTS)
    if not images:
        raise SystemExit(f"No image cards in {cards_dir}")

    print(f"[read-post] ensuring Drive parent folder…", file=sys.stderr)
    parent_id = find_or_create_folder(PARENT_FOLDER_NAME)

    # Organize by month: parent -> "YYYY-MM" -> post subfolder. Month is taken from
    # the YYYY-MM-DD prefix of --name; if absent, the post folder sits directly
    # under the parent.
    import re
    m = re.match(r"(\d{4})-(\d{2})", args.name.strip())
    container_id = parent_id
    if m:
        month = f"{m.group(1)}-{m.group(2)}"
        print(f"[read-post] ensuring month folder '{month}'…", file=sys.stderr)
        container_id = find_or_create_folder(month, parent_id=parent_id)

    print(f"[read-post] creating subfolder '{args.name}'…", file=sys.stderr)
    sub_id = find_or_create_folder(args.name, parent_id=container_id)

    for i, img in enumerate(images, 1):
        print(f"[read-post] uploading card {i}/{len(images)}: {img.name}", file=sys.stderr)
        upload_image(img, sub_id)

    make_anyone_reader(sub_id)
    info = _api("GET", f"{DRIVE_FILES}/{sub_id}?fields=webViewLink")
    link = info.get("webViewLink", f"https://drive.google.com/drive/folders/{sub_id}")

    print(f"[read-post] uploaded {len(images)} cards", file=sys.stderr)
    print(link)   # stdout: the one line the agent puts in the sheet
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
