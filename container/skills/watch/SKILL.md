---
name: watch
description: Watch a video (URL or local path). Downloads with yt-dlp, extracts frames with ffmpeg, gets a timestamped transcript (native captions first, OpenAI Whisper via the OneCLI gateway as fallback), then answers questions about what's in the video.
allowed-tools: Bash, Read
user-invocable: true
---

# /watch — watch a video

You don't have a native video input; this skill gives you one. A Python script
downloads the video, extracts frames as JPEGs, gets a timestamped transcript
(native captions first, OpenAI Whisper as fallback), and prints frame paths.
You then `Read` each frame path to see the images and combine them with the
transcript to answer the user.

All scripts live at `/app/skills/watch/scripts/` inside this container. The
binaries (`ffmpeg`, `ffprobe`, `yt-dlp`, `python3`) are baked into the image.
The OpenAI Whisper credential is injected automatically by the OneCLI gateway —
you never handle a key.

## Step 0 — Preflight (silent on success)

```bash
python3 /app/skills/watch/scripts/setup.py --check
```

Exit 0 (no output) → proceed silently to Step 1. **Do not** announce "setup is
complete". Exit 2 means a required binary is missing from the image — this
should never happen; report it to the user as an image-build problem rather than
trying to install anything (the container filesystem is read-only for packages).

You can skip Step 0 on follow-up `/watch` calls in the same session.

## When to use

- The user pastes a video URL (YouTube, Vimeo, X, TikTok, most yt-dlp sites) and asks about it.
- The user points at a local video file (`.mp4`, `.mov`, `.mkv`, `.webm`, …) in the workspace.
- The user types `/watch <url-or-path> [question]`.

## Recommended limits

- **Best accuracy: videos under 10 minutes.**
- **Hard caps: 100 frames total, 2 fps.** The script targets a frame budget by duration:
  ≤30s → up to 30 frames · 30s-1min → ~40 · 1-3min → ~60 · 3-10min → ~80 · >10min → 100 sparse (warning printed).
- For a long video, consider asking whether the user wants a specific section before burning tokens on a sparse scan.

## How to invoke

**Step 1 — parse input.** Separate the video source from any question.
`/watch https://youtu.be/abc what language is this?` → source = `https://youtu.be/abc`, question = `what language is this?`.

**Step 2 — run the script.** Pass the source verbatim:
```bash
python3 /app/skills/watch/scripts/watch.py "<source>"
```

Optional flags:
- `--start T` / `--end T` — focus on a section (`SS`, `MM:SS`, or `HH:MM:SS`). Auto-scales fps denser.
- `--max-frames N` — lower the cap for a tighter token budget.
- `--resolution W` — frame width in px (default 512; bump to 1024 only to read on-screen text).
- `--fps F` — override auto-fps (clamped to 2 fps).
- `--out-dir DIR` — working directory (default: an auto tmp dir).
- `--no-whisper` — disable the Whisper fallback (frames-only if no captions).

### Focusing on a section (higher frame rate)

When the user asks about a specific moment ("what happens at 2:00?", "the first 10 seconds"),
pass `--start`/`--end`. Focused mode budgets denser (still ≤2 fps). Examples:
```bash
python3 /app/skills/watch/scripts/watch.py video.mp4 --start 50 --end 60
python3 /app/skills/watch/scripts/watch.py "$URL" --start 2:15 --end 2:45 --fps 3
python3 /app/skills/watch/scripts/watch.py "$URL" --start 1:12:00
```
Transcript is auto-filtered to the same range; frame timestamps are absolute.

**Step 3 — Read every frame path the script lists.** The Read tool renders JPEGs
as images. Read all frames in a single message (parallel Read calls) so you see
them together. Frames are chronological with a `t=MM:SS` absolute timestamp.

**Step 4 — answer.** You have two streams: **frames** (what's on screen) and
**transcript** (what's said; header shows `captions` or `whisper (openai)`).
Cite timestamps. If the user asked nothing, summarize structure, key moments,
notable visuals, and spoken content.

**Step 5 — clean up.** The script prints a working dir. If no follow-ups are
likely, delete it: `rm -rf <dir>`. Otherwise leave it for follow-up questions.

## Transcription

1. **Native captions (free, preferred).** yt-dlp pulls subtitles when the source has them.
2. **OpenAI Whisper fallback.** If no captions (or a local file), the script extracts
   mono 16 kHz audio and uploads it to `api.openai.com/v1/audio/transcriptions`
   (`whisper-1`). The OneCLI gateway injects the credential — you do nothing.

## Failure modes

- **Exit 2 from preflight** → a binary is missing from the image. Report it; do not try to install.
- **No captions and Whisper fails** → proceed frames-only and tell the user.
- **401 from Whisper** → the OneCLI gateway has no/invalid OpenAI secret, or this agent's
  secret-mode excludes it. Tell the user the OpenAI credential needs to be connected/enabled
  in OneCLI; do not ask them for a raw key.
- **Download fails (login/region-locked)** → report plainly; do not retry-loop.

## Token efficiency

Frames dominate cost: ~80 frames at 512px ≈ 50-80k image tokens. The transcript is cheap.
Bumping `--resolution` to 1024 roughly quadruples per-frame tokens — only when needed.
If you already watched a video this session, answer follow-ups from context — do **not** re-run.
