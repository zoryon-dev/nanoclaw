#!/usr/bin/env python3
"""Resolve an Instagram/TikTok link to TEXT only.

Carousel/photo -> caption (gallery-dl metadata, no media kept).
Reel/video     -> transcript (captions if present, else Whisper via the gateway).

This is Brown's *seed* extractor: the text feeds a research pass; the post itself
is never archived (no media download to keep, no Drive upload). It reuses the
modules mounted under /app/skills (read-post/gallery.py, watch/*) but stops at
text. Heavy imports are LAZY so the pure helpers stay unit-testable off-container.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

READ_POST = Path("/app/skills/read-post/scripts")
WATCH = Path("/app/skills/watch/scripts")


def classify_type(url: str) -> str:
    """'reel' for explicit video paths, else 'carousel'. Ambiguous Instagram
    /p/ links default to carousel; resolve_carousel handles a video /p/ by
    returning whatever caption gallery-dl exposes."""
    u = url.lower()
    if "/reel/" in u or "/reels/" in u or "/tv/" in u:
        return "reel"
    if "tiktok.com" in u and "/video/" in u:
        return "reel"
    if "youtube.com" in u or "youtu.be" in u:
        return "reel"
    return "carousel"


def parse_caption(gallery_json: str) -> str:
    """Pull the caption from gallery-dl `-j` output. gallery-dl emits a list of
    [kind, url, metadata] triples; the caption sits in the metadata dict under
    'description' (Instagram), else 'content', else 'title'."""
    try:
        data = json.loads(gallery_json or "[]")
    except json.JSONDecodeError:
        return ""
    for entry in data:
        if isinstance(entry, list) and len(entry) > 2 and isinstance(entry[2], dict):
            meta = entry[2]
            cap = meta.get("description") or meta.get("content") or meta.get("title")
            if cap:
                return str(cap).strip()
    return ""


def _ca_env() -> None:
    """gallery-dl/yt-dlp use requests/certifi -> trust the gateway CA."""
    ca = os.environ.get("SSL_CERT_FILE") or os.environ.get("NODE_EXTRA_CA_CERTS")
    if ca and Path(ca).is_file():
        os.environ.setdefault("REQUESTS_CA_BUNDLE", ca)
        os.environ.setdefault("CURL_CA_BUNDLE", ca)


def resolve_carousel(url: str) -> str:
    """Caption only — gallery-dl metadata with --no-download."""
    sys.path.insert(0, str(READ_POST))
    import gallery  # lazy; only resolves on-container
    cookies = gallery.find_cookies()
    res = subprocess.run(
        gallery._base_cmd(cookies) + ["-j", "--no-download", url],
        capture_output=True, text=True, timeout=120,
    )
    return parse_caption(res.stdout)


def resolve_reel(url: str) -> str:
    """Transcript only — reuse the watch download+transcribe pipeline, skip
    frames and Drive. Mirrors read-post/archive.py's reel transcript path."""
    sys.path.insert(0, str(WATCH))
    import download as wdl  # lazy
    import transcribe as wtr  # lazy
    import whisper as wwh  # lazy

    work = Path(tempfile.mkdtemp(prefix="brown-resolve-"))
    try:
        dl = wdl.download(url, work / "dl")
        video = dl["video_path"]
        if dl.get("subtitle_path"):
            try:
                return wtr.format_transcript(wtr.parse_vtt(dl["subtitle_path"])).strip()
            except Exception as exc:  # noqa: BLE001
                print(f"[resolve] caption parse failed: {exc}", file=sys.stderr)
        segs, _backend = wwh.transcribe_video(video, work / "audio.mp3")
        return wtr.format_transcript(segs).strip()
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _platform(url: str) -> str:
    u = url.lower()
    if "instagram.com" in u:
        return "instagram"
    if "tiktok.com" in u:
        return "tiktok"
    if "youtube.com" in u or "youtu.be" in u:
        return "youtube"
    return "other"


def main() -> int:
    ap = argparse.ArgumentParser(description="Resolve an IG/TikTok link to text only.")
    ap.add_argument("url")
    args = ap.parse_args()

    _ca_env()
    kind = classify_type(args.url)
    try:
        text = resolve_reel(args.url) if kind == "reel" else resolve_carousel(args.url)
    except Exception as exc:  # noqa: BLE001
        print(f"[resolve] resolution failed: {exc}", file=sys.stderr)
        return 2
    if not text:
        print("[resolve] no text could be extracted (private post or expired cookies?)",
              file=sys.stderr)
        return 2
    print(json.dumps({
        "platform": _platform(args.url),
        "type": kind,
        "text": text,
        "source_url": args.url,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
