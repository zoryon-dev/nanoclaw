#!/usr/bin/env python3
"""Upload arbitrary files to Google Drive via the OneCLI gateway (NATIVE OAuth).

Generic counterpart to read-post/upload_drive.py: that one is hard-wired to the
"Referências — Conteúdo" parent and image-only cards. This one takes ANY files
(PNG, PDF, HTML, .txt, …) and drops them into a fresh subfolder under a parent
you choose by NAME, shares the subfolder link-readable, and prints the shareable
link. Built for the carousel-export step (Etapa 5.5) so that flow no longer needs
Composio for Drive.

Runs inside the agent container. Plain HTTPS to googleapis.com with NO
Authorization header — the OneCLI gateway injects the `google-drive` OAuth token
(the agent must have that app granted). TLS trusts the gateway CA via SSL_CERT_FILE.

drive.file scope only sees files THIS app created. So `--parent-name` is
find-or-created by this app (you can't target a folder created by Composio or a
human — that's invisible under drive.file). Past Composio-made folders are
untouched; new deliveries live under the native-owned parent.

Usage:
  drive_upload.py \
    --parent-name "Carrosséis — Entregas" \
    --subfolder "2026-06-21 — @zoryon.dev — IA-sem-diagnostico" \
    file1.png file2.png deck.pdf carrossel.html legenda.txt
Prints the subfolder's shareable webViewLink on stdout (the agent puts it in the
delivery message); progress goes to stderr.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import sys
import urllib.error
import uuid
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

DRIVE_FILES = "https://www.googleapis.com/drive/v3/files"
DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name"
FOLDER_MIME = "application/vnd.google-apps.folder"


def _api(method: str, url: str, *, body: bytes | None = None, content_type: str | None = None) -> dict:
    """One gateway-proxied googleapis.com call. No auth header — gateway injects."""
    headers = {"User-Agent": "google-native/1.0 (+nanoclaw)"}
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
                "Google Drive não está concedido a este agente no OneCLI. "
                "Peça ao Jonas pra conceder o app google-drive a este agente e tente de novo."
            )
        raise SystemExit(f"Drive API {method} {url.split('?')[0]} falhou: HTTP {exc.code} {detail}")
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise SystemExit(f"Drive API falhou (rede): {exc}")
    return json.loads(raw) if raw.strip() else {}


def _urlq(s: str) -> str:
    return quote(s, safe="")


def find_or_create_folder(name: str, parent_id: str | None = None) -> str:
    """Return the id of a folder named `name` (under parent_id), creating it if
    absent. drive.file scope only surfaces app-created files — fine, since this
    app owns the parent and every subfolder it makes."""
    q = f"name = '{name.replace(chr(39), chr(92) + chr(39))}' and mimeType = '{FOLDER_MIME}' and trashed = false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
    res = _api("GET", f"{DRIVE_FILES}?q={_urlq(q)}&fields=files(id,name)&pageSize=1")
    files = res.get("files") or []
    if files:
        return files[0]["id"]
    meta: dict = {"name": name, "mimeType": FOLDER_MIME}
    if parent_id:
        meta["parents"] = [parent_id]
    created = _api("POST", f"{DRIVE_FILES}?fields=id",
                   body=json.dumps(meta).encode(), content_type="application/json")
    return created["id"]


def upload_file(path: Path, folder_id: str) -> None:
    """Multipart upload one file (any type) into the folder."""
    boundary = f"----GNUpload{uuid.uuid4().hex}"
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
    """Grant 'anyone with the link' read access so the folder link opens."""
    _api("POST", f"{DRIVE_FILES}/{file_id}/permissions",
         body=json.dumps({"role": "reader", "type": "anyone"}).encode(),
         content_type="application/json")


def main() -> int:
    ap = argparse.ArgumentParser(prog="drive_upload",
                                 description="Upload arbitrary files to a Drive subfolder (native OAuth).")
    ap.add_argument("--parent-name", required=True, help="Parent folder name (find-or-created by this app)")
    ap.add_argument("--subfolder", required=True, help="Delivery subfolder name to create under the parent")
    ap.add_argument("files", nargs="+", help="Files to upload (any type)")
    args = ap.parse_args()

    paths = [Path(f) for f in args.files]
    missing = [str(p) for p in paths if not p.is_file()]
    if missing:
        raise SystemExit(f"Arquivos não encontrados: {', '.join(missing)}")

    print(f"[drive_upload] garantindo pasta-mãe '{args.parent_name}'…", file=sys.stderr)
    parent_id = find_or_create_folder(args.parent_name)

    print(f"[drive_upload] criando subpasta '{args.subfolder}'…", file=sys.stderr)
    sub_id = find_or_create_folder(args.subfolder, parent_id=parent_id)

    for i, p in enumerate(paths, 1):
        print(f"[drive_upload] subindo {i}/{len(paths)}: {p.name}", file=sys.stderr)
        upload_file(p, sub_id)

    make_anyone_reader(sub_id)
    info = _api("GET", f"{DRIVE_FILES}/{sub_id}?fields=webViewLink")
    link = info.get("webViewLink", f"https://drive.google.com/drive/folders/{sub_id}")

    print(f"[drive_upload] subiu {len(paths)} arquivo(s)", file=sys.stderr)
    print(link)  # stdout: the shareable folder link
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
