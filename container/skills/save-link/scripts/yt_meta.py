#!/usr/bin/env python3
"""Fetch YouTube metadata (+ captions, best-effort) via yt-dlp.

Stdlib + yt-dlp. Prints one JSON object:
  {"title","channel","duration","description","tags","captions_excerpt","error"?}

If yt-dlp is missing or the video has no captions, it degrades gracefully
(captions_excerpt=null, or error set with whatever metadata was obtained).
Usage: yt_meta.py <youtube-url>
"""
import json
import re
import subprocess
import sys
import urllib.request

TIMEOUT = 60
DESC_CHARS = 1200
CAP_CHARS = 3000


def _captions_excerpt(info: dict) -> str | None:
    tracks = {}
    for store in ("subtitles", "automatic_captions"):
        for lang, fmts in (info.get(store) or {}).items():
            low = lang.lower()
            if low.startswith("en") or low.startswith("pt"):
                tracks.setdefault(low, fmts)
    if not tracks:
        return None
    # prefer pt, then en; pick a json3/vtt url
    for lang in sorted(tracks, key=lambda l: (not l.startswith("pt"), l)):
        for fmt in tracks[lang]:
            url = fmt.get("url")
            if not url:
                continue
            try:
                with urllib.request.urlopen(url, timeout=20) as r:
                    raw = r.read().decode("utf-8", "replace")
            except Exception:
                continue
            text = _strip_caption(raw, fmt.get("ext", ""))
            if text:
                return text[:CAP_CHARS]
    return None


def _strip_caption(raw: str, ext: str) -> str:
    if raw.lstrip().startswith("{"):  # json3
        try:
            data = json.loads(raw)
            words = []
            for ev in data.get("events", []):
                for seg in ev.get("segs", []) or []:
                    words.append(seg.get("utf8", ""))
            return re.sub(r"\s+", " ", "".join(words)).strip()
        except Exception:
            return ""
    # vtt / srt
    lines = []
    for line in raw.splitlines():
        if "-->" in line or line.strip().isdigit() or line.startswith("WEBVTT") or not line.strip():
            continue
        lines.append(re.sub(r"<[^>]+>", "", line))
    return re.sub(r"\s+", " ", " ".join(lines)).strip()


def main(argv):
    if len(argv) != 2:
        print(json.dumps({"error": "usage: yt_meta.py <url>"}))
        return 2
    url = argv[1]
    try:
        proc = subprocess.run(
            ["yt-dlp", "--dump-json", "--skip-download", "--no-warnings", url],
            capture_output=True, text=True, timeout=TIMEOUT,
        )
    except FileNotFoundError:
        print(json.dumps({"error": "yt-dlp not installed", "url": url}))
        return 1
    except subprocess.TimeoutExpired:
        print(json.dumps({"error": "yt-dlp timeout", "url": url}))
        return 1
    if proc.returncode != 0:
        print(json.dumps({"error": (proc.stderr or "yt-dlp failed").strip()[:300], "url": url}))
        return 1
    try:
        info = json.loads(proc.stdout)
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": f"parse: {exc}", "url": url}))
        return 1
    out = {
        "title": info.get("title"),
        "channel": info.get("channel") or info.get("uploader"),
        "duration": info.get("duration"),
        "description": (info.get("description") or "")[:DESC_CHARS] or None,
        "tags": (info.get("tags") or [])[:15],
    }
    try:
        out["captions_excerpt"] = _captions_excerpt(info)
    except Exception:
        out["captions_excerpt"] = None
    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
