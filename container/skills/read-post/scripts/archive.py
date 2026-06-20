#!/usr/bin/env python3
"""Unified content archiver — detects carousel vs reel/video and routes.

One command for the agent: download the content, upload its media to Google
Drive, and emit a standardized report the agent turns into ONE sheet row
(Tipo distinguishes carrossel / foto / reel). All heavy lifting is here so a
heavy agent turn can't skip a step.

- Carousel / photo  -> delegates to gallery.py --drive (cards -> Drive).
- Reel / video      -> reuses the /watch pipeline (download + frames + transcript),
                       uploads ~6 KEY frames to Drive, prints the transcript.

Pure stdlib; reuses the watch skill's modules (both skills are mounted under
/app/skills). gallery-dl/yt-dlp/ffmpeg + the OneCLI gateway do the rest.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
WATCH_SCRIPTS = Path("/app/skills/watch/scripts")
KEY_FRAMES = 6


def _ca_env() -> None:
    """gallery-dl/yt-dlp use requests/certifi → point them at the gateway CA."""
    ca = os.environ.get("SSL_CERT_FILE") or os.environ.get("NODE_EXTRA_CA_CERTS")
    if ca and Path(ca).is_file():
        os.environ.setdefault("REQUESTS_CA_BUNDLE", ca)
        os.environ.setdefault("CURL_CA_BUNDLE", ca)


def is_reel(url: str) -> bool:
    """Decide reel vs carousel. Explicit video paths are reels; for ambiguous
    Instagram /p/ links we probe gallery-dl (image extractor) — if it sees no
    images it's a video."""
    u = url.lower()
    if "/reel/" in u or "/reels/" in u or "/tv/" in u or "youtube.com" in u or "youtu.be" in u:
        return True
    if "tiktok.com" in u and "/video/" in u:
        return True
    # Ambiguous (e.g. instagram /p/): probe gallery-dl for image entries.
    sys.path.insert(0, str(HERE))
    try:
        import gallery  # noqa: E402
        cookies = gallery.find_cookies()
        res = subprocess.run(gallery._base_cmd(cookies) + ["-j", "--no-download", url],
                             capture_output=True, text=True, timeout=90)
        import json
        data = json.loads(res.stdout or "[]")
        has_video = any(isinstance(e, list) and len(e) > 2 and isinstance(e[2], dict)
                        and (e[2].get("video_url") or e[2].get("_ytdl") or "video" in str(e[2].get("type", "")))
                        for e in data)
        has_img = any(isinstance(e, list) and len(e) >= 2 and isinstance(e[1], str)
                      and e[1].startswith("http") for e in data)
        return has_video and not has_img
    except Exception:
        return False


def run_carousel(url: str, out_dir: str | None) -> int:
    cmd = [sys.executable, str(HERE / "gallery.py"), url, "--drive"]
    if out_dir:
        cmd += ["--out-dir", out_dir]
    return subprocess.run(cmd).returncode


def run_reel(url: str, work: Path) -> int:
    sys.path.insert(0, str(WATCH_SCRIPTS))
    import download as wdl
    import frames as wfr
    import transcribe as wtr
    import whisper as wwh

    print("[archive] downloading reel…", file=sys.stderr)
    dl = wdl.download(url, work / "download")
    video = dl["video_path"]
    info = dl.get("info") or {}
    meta = wfr.get_metadata(video)
    duration = meta.get("duration_seconds") or 0.0

    fps, target = wfr.auto_fps(duration, max_frames=24)
    all_frames = wfr.extract(video, work / "frames", fps=fps, resolution=512, max_frames=24)

    # transcript: native captions first, else Whisper (gateway injects the key)
    transcript = ""
    source = "none"
    if dl.get("subtitle_path"):
        try:
            transcript = wtr.format_transcript(wtr.parse_vtt(dl["subtitle_path"]))
            source = "captions"
        except Exception as exc:
            print(f"[archive] caption parse failed: {exc}", file=sys.stderr)
    if not transcript:
        try:
            segs, backend = wwh.transcribe_video(video, work / "audio.mp3")
            transcript = wtr.format_transcript(segs)
            source = f"whisper ({backend})"
        except SystemExit as exc:
            print(f"[archive] transcript unavailable: {exc}", file=sys.stderr)

    # pick ~KEY_FRAMES evenly-spaced key frames, copy to a dir, upload to Drive
    drive_link = None
    if all_frames:
        step = max(1, len(all_frames) // KEY_FRAMES)
        key = all_frames[::step][:KEY_FRAMES]
        keydir = work / "keyframes"
        keydir.mkdir(parents=True, exist_ok=True)
        for i, fr in enumerate(key, 1):
            dst = keydir / f"frame_{i:02d}.jpg"
            dst.write_bytes(Path(fr["path"]).read_bytes())
        handle = info.get("uploader") or info.get("title") or "reel"
        sub = " — ".join(p for p in [_short_date(info), f"@{handle}", "reel"] if p)
        res = subprocess.run(
            [sys.executable, str(HERE / "upload_drive.py"), str(keydir), "--name", sub],
            capture_output=True, text=True,
        )
        if res.returncode == 0 and res.stdout.strip():
            drive_link = res.stdout.strip().splitlines()[-1]
        else:
            print(f"[archive] keyframe upload failed: {res.stderr.strip()[-200:]}", file=sys.stderr)

    _emit_reel_report(url, info, duration, transcript, source, drive_link, work)
    return 0


def _short_date(info: dict) -> str:
    # yt-dlp upload_date is YYYYMMDD; format to YYYY-MM-DD if present.
    d = str(info.get("upload_date") or "")
    return f"{d[:4]}-{d[4:6]}-{d[6:8]}" if len(d) == 8 else ""


def _fmt_dur(sec: float) -> str:
    s = int(round(sec))
    return f"{s // 60}:{s % 60:02d}"


def _emit_reel_report(url, info, duration, transcript, source, drive_link, work) -> None:
    uploader = info.get("uploader") or info.get("channel") or ""
    print()
    print("# archive: reel / video")
    print()
    print(f"- **Tipo:** reel")
    print(f"- **Platform:** {_platform(url)}")
    print(f"- **Profile:** @{uploader}" if uploader else "- **Profile:** unknown")
    print(f"- **Post:** {info.get('url') or url}")
    print(f"- **Métrica (duração):** {_fmt_dur(duration)}")
    if info.get("title"):
        print(f"- **Title:** {info['title']}")
    cap = " ".join((info.get("description") or "").split())
    print(f"- **Legenda:** {cap[:800]}{'…' if len(cap) > 800 else ''}" if cap else "- **Legenda:** _(none)_")
    print(f"- **Drive folder (keyframes):** {drive_link or 'UPLOAD FAILED — use post URL'}")
    print()
    print(f"## Conteúdo (transcrição — fonte: {source})")
    print()
    print("```")
    print(transcript if transcript else "(transcrição indisponível)")
    print("```")
    print()
    print("---")
    print(f"_Work dir: `{work}` — write the sheet row, then delete it._")


def _platform(url: str) -> str:
    u = url.lower()
    for k, v in (("instagram", "instagram"), ("tiktok", "tiktok"),
                 ("youtube", "youtube"), ("youtu.be", "youtube"), ("twitter", "twitter"), ("x.com", "twitter")):
        if k in u:
            return v
    return "unknown"


def main() -> int:
    ap = argparse.ArgumentParser(prog="archive", description="Archive a post/reel to Drive + emit a sheet-ready report.")
    ap.add_argument("source", help="Post or reel URL")
    ap.add_argument("--out-dir", default=None)
    args = ap.parse_args()
    _ca_env()

    if is_reel(args.source):
        work = Path(args.out_dir).expanduser().resolve() if args.out_dir else Path(tempfile.mkdtemp(prefix="reel-"))
        work.mkdir(parents=True, exist_ok=True)
        print(f"[archive] detected: reel/video. working dir: {work}", file=sys.stderr)
        return run_reel(args.source, work)
    print("[archive] detected: carousel/photo.", file=sys.stderr)
    return run_carousel(args.source, args.out_dir)


if __name__ == "__main__":
    raise SystemExit(main())
