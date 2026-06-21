#!/usr/bin/env python3
"""Download an image post / carousel (Instagram, TikTok slideshow, X) via gallery-dl.

yt-dlp is video-only; this pulls every carousel card plus the post metadata.
Prints a structured report — platform, profile, caption, date, card count, and
the local path + type of each card, in order. The agent then Reads each image
card to extract its text and routes the result to Drive + Notion (see SKILL.md).

Cookies (the same file /watch uses) enable Instagram / TikTok / X. Pure stdlib;
shells out to the `gallery-dl` binary baked into the image.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


DEFAULT_COOKIES_PATH = Path("/workspace/agent/.watch-cookies.txt")
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".gif"}
VIDEO_EXTS = {".mp4", ".mov", ".webm", ".mkv"}

# Post-level metadata keys we surface (gallery-dl repeats these on every card).
META_KEYS = ("category", "username", "fullname", "description", "count",
             "post_shortcode", "post_url", "date", "likes")


def find_cookies() -> Path | None:
    env = os.environ.get("WATCH_COOKIES")
    for c in ([Path(env).expanduser()] if env else []) + [DEFAULT_COOKIES_PATH]:
        if c.is_file() and c.stat().st_size > 0:
            return c
    return None


def _base_cmd(cookies: Path | None) -> list[str]:
    cmd = ["gallery-dl"]
    if cookies is not None:
        cmd += ["--cookies", str(cookies)]
    return cmd


def fetch_metadata(url: str, cookies: Path | None) -> dict:
    """Run gallery-dl in dump-json mode and return post-level metadata.

    `-j` emits a list of messages; URL messages carry a metadata dict that
    repeats the post-level fields on every card. We take the first one found.
    """
    res = subprocess.run(_base_cmd(cookies) + ["-j", url], capture_output=True, text=True)
    if res.returncode != 0:
        raise SystemExit(f"gallery-dl metadata fetch failed: {res.stderr.strip()[:400]}")
    try:
        data = json.loads(res.stdout or "[]")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"gallery-dl returned non-JSON: {exc}")
    for entry in data:
        if isinstance(entry, list):
            for el in entry:
                if isinstance(el, dict) and "description" in el:
                    return {k: el.get(k) for k in META_KEYS if k in el}
    return {}


def download(url: str, out_dir: Path, cookies: Path | None) -> list[Path]:
    """Download every card into out_dir with ordered `card_NN.ext` names."""
    out_dir.mkdir(parents=True, exist_ok=True)
    cmd = _base_cmd(cookies) + [
        "-D", str(out_dir),                              # flat dir, no category subfolders
        "--filename", "card_{num:>02}.{extension}",      # ordered, predictable names
        "--no-mtime",
        url,
    ]
    res = subprocess.run(cmd, stdout=sys.stderr, stderr=sys.stderr)
    cards = sorted(p for p in out_dir.iterdir()
                   if p.is_file() and p.suffix.lower() in (IMAGE_EXTS | VIDEO_EXTS))
    if not cards:
        raise SystemExit(
            f"gallery-dl produced no media in {out_dir} (exit {res.returncode}). "
            "If this is a video/Reel, use /watch instead."
        )
    return cards


def main() -> int:
    ap = argparse.ArgumentParser(prog="gallery", description="Download an image post / carousel.")
    ap.add_argument("source", help="Post URL (Instagram /p/, TikTok photo, X status)")
    ap.add_argument("--out-dir", default=None, help="Working directory (default: tmp)")
    ap.add_argument("--drive", action="store_true",
                    help="After download, upload the cards to Google Drive (via upload_drive.py) "
                         "and include the folder link in the report. Done here so the upload is "
                         "deterministic and the agent can't skip it.")
    args = ap.parse_args()

    # gallery-dl uses `requests` (certifi), which ignores SSL_CERT_FILE. Under the
    # OneCLI gateway, instagram.com is TLS-intercepted with the gateway CA, so point
    # requests at the combined CA bundle or downloads fail with CERTIFICATE_VERIFY_FAILED.
    import os
    ca = os.environ.get("SSL_CERT_FILE") or os.environ.get("NODE_EXTRA_CA_CERTS")
    if ca and Path(ca).is_file():
        os.environ.setdefault("REQUESTS_CA_BUNDLE", ca)
        os.environ.setdefault("CURL_CA_BUNDLE", ca)

    cookies = find_cookies()
    work = Path(args.out_dir).expanduser().resolve() if args.out_dir else Path(tempfile.mkdtemp(prefix="post-"))
    work.mkdir(parents=True, exist_ok=True)
    print(f"[read-post] working dir: {work}", file=sys.stderr)
    if cookies:
        print(f"[read-post] using cookies: {cookies}", file=sys.stderr)

    meta = fetch_metadata(args.source, cookies)
    cards = download(args.source, work / "cards", cookies)

    images = [c for c in cards if c.suffix.lower() in IMAGE_EXTS]
    videos = [c for c in cards if c.suffix.lower() in VIDEO_EXTS]

    handle = meta.get("username")
    fullname = meta.get("fullname")
    profile = f"@{handle}" + (f" ({fullname})" if fullname else "") if handle else "unknown"
    date = (meta.get("date") or "")[:10]
    shortcode = meta.get("post_shortcode") or ""

    # Upload the cards to Drive HERE (not as an agent step) so it is deterministic
    # and can't be skipped when the agent's turn gets heavy. Prints the link below.
    drive_link = None
    drive_error = None
    if args.drive and images:
        folder_name = " — ".join(p for p in [date, f"@{handle}" if handle else None, shortcode] if p) or "post"
        uploader = str(Path(__file__).with_name("upload_drive.py"))
        print(f"[read-post] uploading {len(images)} cards to Drive…", file=sys.stderr)
        res = subprocess.run(
            [sys.executable, uploader, str(work / "cards"), "--name", folder_name],
            capture_output=True, text=True,
        )
        if res.returncode == 0:
            drive_link = (res.stdout or "").strip().splitlines()[-1] if res.stdout.strip() else None
        else:
            drive_error = (res.stderr or "").strip().splitlines()[-1] if res.stderr.strip() else "upload failed"
            print(f"[read-post] Drive upload failed: {drive_error}", file=sys.stderr)

    print()
    print("# read-post: image post / carousel")
    print()
    print(f"- **Platform:** {meta.get('category') or 'unknown'}")
    print(f"- **Profile:** {profile}")
    print(f"- **Post:** {meta.get('post_url') or args.source}")
    if meta.get("post_shortcode"):
        print(f"- **Shortcode:** {meta['post_shortcode']}")
    if date:
        print(f"- **Date:** {date}")
    if meta.get("likes") is not None:
        print(f"- **Likes:** {meta['likes']}")
    print(f"- **Cards:** {len(cards)} ({len(images)} image, {len(videos)} video)")
    if args.drive:
        if drive_link:
            print(f"- **Drive folder:** {drive_link}")
        else:
            print(f"- **Drive folder:** UPLOAD FAILED ({drive_error or 'unknown'}) — "
                  f"use the post URL in the Notion row's Midia (Drive) field")
    caption = (meta.get("description") or "").strip()
    print()
    print("## Caption")
    print()
    print(caption if caption else "_(no caption)_")
    print()
    print("## Cards")
    print()
    print("**Read each image card below to extract its text. Cards are in order.**")
    print()
    for i, c in enumerate(cards, 1):
        kind = "image" if c.suffix.lower() in IMAGE_EXTS else "video"
        print(f"- `{c}` (card {i}, {kind})")
    print()
    print("---")
    print(f"_Work dir: `{work}` — upload to Drive + create the Notion row, then delete it (see SKILL.md)._")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
