# /watch Skill → NanoClaw Container Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Zory agent the ability to "watch" videos (URL or local file) from inside its NanoClaw container — download, extract frames, transcribe (native captions → OpenAI Whisper via OneCLI), and answer questions.

**Architecture:** Port `bradautomates/claude-video` (`watch` v0.1.3) as a NanoClaw **container skill** under `container/skills/watch/`. Bake the binaries (`ffmpeg`, `python3`, pinned `yt-dlp`) into the agent image. Adapt exactly two of the six Python scripts so the OpenAI Whisper credential is injected transparently by the OneCLI gateway at the HTTPS proxy boundary instead of being read from a local `.env`. The other four scripts are copied verbatim. Zory's container config is `"skills": "all"`, so dropping the skill into the tree exposes it automatically.

**Tech Stack:** Docker (`node:22-slim` base), Python 3 stdlib (scripts are pure-stdlib subprocess wrappers — no pip packages), `ffmpeg`/`ffprobe`, `yt-dlp` standalone zipapp, OneCLI gateway (transparent credential injection on `api.openai.com`).

**Spec:** `docs/superpowers/specs/2026-06-20-watch-skill-nanoclaw-design.md`

---

## Key facts established during planning (do not re-derive)

- `download.py`, `frames.py`, `transcribe.py`, `watch.py` call the **binaries** via `subprocess` and import no third-party Python module → only the binaries are needed, not the `yt-dlp` pip package.
- `whisper.py` uses `urllib` + `ssl.create_default_context()`, which trusts the **system CA store** (`/etc/ssl/certs`). The OneCLI CA is already in that store (curl/claude-code work through the proxy), so Whisper's TLS through the intercepting proxy needs **no CA change**. This is why we do **not** touch `certifi` — the scripts never use `requests`.
- The OneCLI gateway is wired by `src/container-runner.ts` (`onecli.applyContainerConfig`), which sets `HTTPS_PROXY` and the CA in every spawned container. Subprocesses (`yt-dlp`) and `urllib` (`whisper.py`) both honor `HTTPS_PROXY` automatically.
- Container skills are mounted read-only at `/app/skills` (`src/container-runner.ts:320`). The skill scripts will live at `/app/skills/watch/scripts/` — reference that absolute path in `SKILL.md`.
- OpenAI secret is already in the vault (`id 710b7d2d-f518-475d-93fb-d299fc431600`, host `api.openai.com`, header `Authorization`, format `Bearer {value}`).

## Verbatim-copy strategy (avoids transcription errors)

Four scripts are byte-identical to upstream. The plan copies them with `cp` from the installed plugin cache rather than re-transcribing ~600 lines (which would risk silent typos). Source dir:

```
/root/.claude/plugins/cache/claude-video/watch/0.1.3/scripts/
```

Only `whisper.py` and `setup.py` are hand-edited (shown in full below). `SKILL.md` is rewritten for NanoClaw (shown in full below).

## File structure

```
container/Dockerfile                              MODIFY  — add ffmpeg, python3, pinned yt-dlp
container/skills/watch/SKILL.md                   CREATE  — NanoClaw-native skill instructions
container/skills/watch/scripts/watch.py           CREATE  — verbatim copy
container/skills/watch/scripts/download.py        CREATE  — verbatim copy
container/skills/watch/scripts/frames.py          CREATE  — verbatim copy
container/skills/watch/scripts/transcribe.py      CREATE  — verbatim copy
container/skills/watch/scripts/whisper.py         CREATE  — adapted (OneCLI injection)
container/skills/watch/scripts/setup.py           CREATE  — adapted (binary-only preflight)
```

## Note on testing approach

These scripts are thin `subprocess` wrappers around `ffmpeg`/`yt-dlp` plus one `urllib` upload. The repo has no Python test runner (host = vitest, container = bun:test), and the real risk is **integration** (proxy + CA + OneCLI injection), which only a live container run exercises. So this plan verifies with:
1. A self-contained adaptation assertion (`python3 -c …`) for the two edited files — no network.
2. An in-image pipeline run against a real public video (frames + captions) — no proxy.
3. A live agent test through Zory's real session (Whisper + injection) — the only thing that can validate the gateway path.

We deliberately do **not** add a pytest harness — that would be scope creep for six stdlib wrappers, and would still not exercise the gateway, which is the only untested-by-construction part.

---

### Task 1: Add ffmpeg, python3, and pinned yt-dlp to the agent image

**Files:**
- Modify: `container/Dockerfile:22-25` (ARG block) and `container/Dockerfile:32-57` (apt block + new yt-dlp layer)

- [ ] **Step 1: Confirm a real, current yt-dlp release tag before pinning**

Run:
```bash
curl -fsSL -I "https://github.com/yt-dlp/yt-dlp/releases/download/2025.09.26/yt-dlp" | head -1
```
Expected: `HTTP/2 302` (GitHub redirects release asset downloads) or `200`. If you get `404`, open https://github.com/yt-dlp/yt-dlp/releases, take the latest stable tag (format `YYYY.MM.DD`), and use that tag in Step 3 instead. Pin deliberately — never float yt-dlp (per CLAUDE.md "Container Runtime").

- [ ] **Step 2: Add the YT_DLP_VERSION build arg**

In `container/Dockerfile`, after line 25 (`ARG BUN_VERSION=1.3.12`), add:
```dockerfile
# yt-dlp for the /watch skill. Standalone zipapp (needs the python3 we install
# below). Pin deliberately — yt-dlp ships frequent releases. Verify the tag
# resolves before bumping (the build 404s loudly if it doesn't).
ARG YT_DLP_VERSION=2025.09.26
```

- [ ] **Step 3: Add ffmpeg + python3 to the apt block and install yt-dlp**

In `container/Dockerfile`, add `ffmpeg \` and `python3 \` to the `apt-get install` list (the block at lines 32-53, e.g. right after `chromium \`). Then, immediately after the apt `RUN` block (after line 57), add a new layer:
```dockerfile
# ---- /watch skill runtime: yt-dlp -------------------------------------------
# ffmpeg/ffprobe (apt, above) + python3 (apt, above) + the yt-dlp zipapp.
# download.py/frames.py shell out to these binaries; no pip packages needed.
RUN curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp" \
        -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp
```

- [ ] **Step 4: Build the image**

Run:
```bash
./container/build.sh
```
Expected: build completes; the new layers install ffmpeg/python3 and fetch yt-dlp without error.

- [ ] **Step 5: Verify the three binaries exist and run in the image**

Run:
```bash
docker run --rm --entrypoint sh nanoclaw-agent:latest -c \
  'ffmpeg -version | head -1 && ffprobe -version | head -1 && python3 --version && yt-dlp --version'
```
Expected: a version line for each (ffmpeg, ffprobe, python3 ≥ 3.11, a yt-dlp date version). If `yt-dlp --version` errors with a Python traceback, python3 is missing from the apt list — fix Step 3.

- [ ] **Step 6: Commit**

```bash
git add container/Dockerfile
git commit -m "feat(container): add ffmpeg, python3, yt-dlp for /watch skill"
```

---

### Task 2: Scaffold the skill and copy the four unchanged scripts verbatim

**Files:**
- Create: `container/skills/watch/scripts/{watch,download,frames,transcribe}.py`

- [ ] **Step 1: Create the skill scripts directory**

Run:
```bash
mkdir -p /root/nanoclaw/container/skills/watch/scripts
```

- [ ] **Step 2: Copy the four verbatim scripts from the plugin cache**

Run:
```bash
SRC=/root/.claude/plugins/cache/claude-video/watch/0.1.3/scripts
DST=/root/nanoclaw/container/skills/watch/scripts
cp "$SRC/watch.py" "$SRC/download.py" "$SRC/frames.py" "$SRC/transcribe.py" "$DST/"
```

- [ ] **Step 3: Verify they copied intact**

Run:
```bash
cd /root/nanoclaw && for f in watch download frames transcribe; do
  python3 -m py_compile container/skills/watch/scripts/$f.py && echo "$f.py OK"
done
```
Expected: `watch.py OK`, `download.py OK`, `frames.py OK`, `transcribe.py OK` (compiles cleanly).

- [ ] **Step 4: Commit**

```bash
git add container/skills/watch/scripts/watch.py container/skills/watch/scripts/download.py container/skills/watch/scripts/frames.py container/skills/watch/scripts/transcribe.py
git commit -m "feat(watch): add verbatim frame/download/transcribe scripts"
```

---

### Task 3: Add the adapted whisper.py (OneCLI credential injection)

**Files:**
- Create: `container/skills/watch/scripts/whisper.py`

The only differences from upstream: `load_api_key` always selects OpenAI with a sentinel (the gateway injects the real key), and `_post_whisper` omits the `Authorization` header so the gateway injects it cleanly. Everything else is identical.

- [ ] **Step 1: Write the adapted whisper.py**

Create `container/skills/watch/scripts/whisper.py` with this exact content:

```python
#!/usr/bin/env python3
"""Transcribe a video via OpenAI Whisper through the OneCLI gateway.

NanoClaw adaptation of the upstream watch skill: the OpenAI credential is
injected transparently by the OneCLI gateway at the HTTPS proxy boundary
(host pattern api.openai.com). This module therefore sends the request with
NO Authorization header — the gateway adds it. No local API key is read.

Extract audio (mono 16kHz mp3, tiny payload), upload, return segments in the
same shape as transcribe.parse_vtt so the rest of the pipeline doesn't care
where the transcript came from. Pure stdlib.
"""
from __future__ import annotations

import io
import json
import mimetypes
import shutil
import ssl
import subprocess
import sys
import time
import urllib.error
import uuid
from pathlib import Path
from urllib.request import Request, urlopen


OPENAI_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions"
OPENAI_MODEL = "whisper-1"

# Sentinel placeholder. The OneCLI gateway injects the real OpenAI credential
# at the proxy boundary; this value is never sent (see _post_whisper).
ONECLI_SENTINEL = "onecli-managed"


def load_api_key(preferred: str | None = None) -> tuple[str, str]:
    """Select the Whisper backend. NanoClaw: only OpenAI is wired, and its
    credential is injected by OneCLI — there is no local key. Returns
    ("openai", sentinel). `preferred` is accepted for CLI compatibility;
    "groq" is coerced to "openai" since Groq is not configured in this install.
    """
    backend = preferred or "openai"
    if backend != "openai":
        backend = "openai"
    return backend, ONECLI_SENTINEL


def extract_audio(video_path: str, out_path: Path) -> Path:
    """Extract mono 16kHz 64kbps mp3 — ~480 kB/min, fits the Whisper limit."""
    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg is not installed (should be baked into the image)")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", str(Path(video_path).resolve()),
        "-vn",
        "-acodec", "libmp3lame",
        "-ar", "16000",
        "-ac", "1",
        "-b:a", "64k",
        str(out_path.resolve()),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"ffmpeg audio extraction failed: {result.stderr.strip()}")
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise SystemExit("ffmpeg produced no audio — video may have no audio track")
    return out_path


def _build_multipart(fields: dict[str, str], file_path: Path) -> tuple[bytes, str]:
    """Assemble a multipart/form-data body the Whisper API accepts."""
    boundary = f"----WatchBoundary{uuid.uuid4().hex}"
    eol = b"\r\n"
    buf = io.BytesIO()

    for name, value in fields.items():
        buf.write(f"--{boundary}".encode()); buf.write(eol)
        buf.write(f'Content-Disposition: form-data; name="{name}"'.encode()); buf.write(eol)
        buf.write(eol)
        buf.write(str(value).encode()); buf.write(eol)

    mimetype = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    buf.write(f"--{boundary}".encode()); buf.write(eol)
    buf.write(
        f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"'.encode()
    )
    buf.write(eol)
    buf.write(f"Content-Type: {mimetype}".encode()); buf.write(eol)
    buf.write(eol)
    buf.write(file_path.read_bytes())
    buf.write(eol)
    buf.write(f"--{boundary}--".encode()); buf.write(eol)

    return buf.getvalue(), boundary


MAX_ATTEMPTS = 4       # initial + 3 retries
MAX_429_RETRIES = 2
RETRY_BASE_DELAY = 2.0


def _post_whisper(endpoint: str, api_key: str, model: str, audio_path: Path) -> dict:
    fields = {
        "model": model,
        "response_format": "verbose_json",
        "temperature": "0",
    }
    body, boundary = _build_multipart(fields, audio_path)
    # NO Authorization header: the OneCLI gateway injects the OpenAI credential
    # for api.openai.com at the proxy boundary. `api_key` is intentionally unused
    # here (the sentinel from load_api_key); kept in the signature for symmetry.
    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "User-Agent": "watch-skill/1.0 (+nanoclaw; python-urllib)",
    }

    context = ssl.create_default_context()
    rate_limit_hits = 0
    last_exc: Exception | None = None
    last_detail = ""

    for attempt in range(MAX_ATTEMPTS):
        request = Request(endpoint, data=body, headers=headers, method="POST")
        try:
            with urlopen(request, timeout=300, context=context) as response:
                payload = response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            detail = _read_error_body(exc)
            last_exc, last_detail = exc, detail

            if 400 <= exc.code < 500 and exc.code != 429:
                raise SystemExit(f"Whisper request failed: {exc}{detail}")

            if exc.code == 429:
                rate_limit_hits += 1
                if rate_limit_hits >= MAX_429_RETRIES:
                    raise SystemExit(f"Whisper request failed: {exc}{detail}")
                delay = _retry_after(exc) or RETRY_BASE_DELAY * (2 ** attempt) + 1
            else:
                delay = RETRY_BASE_DELAY * (2 ** attempt)

            if attempt < MAX_ATTEMPTS - 1:
                print(
                    f"[watch] whisper HTTP {exc.code} — retrying in {delay:.1f}s "
                    f"(attempt {attempt + 2}/{MAX_ATTEMPTS})",
                    file=sys.stderr,
                )
                time.sleep(delay)
            continue
        except (urllib.error.URLError, TimeoutError, ConnectionResetError, OSError) as exc:
            last_exc, last_detail = exc, ""
            if attempt < MAX_ATTEMPTS - 1:
                delay = RETRY_BASE_DELAY * (attempt + 1)
                print(
                    f"[watch] whisper network error ({type(exc).__name__}: {exc}) — "
                    f"retrying in {delay:.1f}s (attempt {attempt + 2}/{MAX_ATTEMPTS})",
                    file=sys.stderr,
                )
                time.sleep(delay)
            continue

        try:
            return json.loads(payload)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"Whisper returned non-JSON response: {exc}: {payload[:200]}")

    raise SystemExit(
        f"Whisper request failed after {MAX_ATTEMPTS} attempts: {last_exc}{last_detail}"
    )


def _read_error_body(exc: urllib.error.HTTPError) -> str:
    try:
        body = exc.read()
    except Exception:
        return ""
    if not body:
        return ""
    try:
        return f" — {body.decode('utf-8', errors='replace')[:400]}"
    except Exception:
        return ""


def _retry_after(exc: urllib.error.HTTPError) -> float | None:
    header = exc.headers.get("Retry-After") if getattr(exc, "headers", None) else None
    if not header:
        return None
    try:
        return float(header)
    except ValueError:
        return None


def _segments_from_response(data: dict) -> list[dict]:
    """Convert Whisper verbose_json into our {start, end, text} segment format."""
    out: list[dict] = []
    for seg in data.get("segments") or []:
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        out.append({
            "start": round(float(seg.get("start") or 0.0), 2),
            "end": round(float(seg.get("end") or 0.0), 2),
            "text": text,
        })

    if not out:
        full = (data.get("text") or "").strip()
        if full:
            out.append({"start": 0.0, "end": 0.0, "text": full})

    return out


def transcribe_video(
    video_path: str,
    audio_out: Path,
    backend: str | None = None,
    api_key: str | None = None,
) -> tuple[list[dict], str]:
    """Run the full flow: extract audio → upload → parse segments.

    Returns (segments, backend_used). Raises SystemExit on any failure.
    """
    if backend is None or api_key is None:
        detected_backend, detected_key = load_api_key()
        backend = backend or detected_backend
        api_key = api_key or detected_key

    print(f"[watch] extracting audio for Whisper ({backend})…", file=sys.stderr)
    audio_path = extract_audio(video_path, audio_out)
    size_kb = audio_path.stat().st_size / 1024
    print(f"[watch] audio: {size_kb:.0f} kB — uploading to {backend} Whisper…", file=sys.stderr)

    if backend == "openai":
        response = _post_whisper(OPENAI_ENDPOINT, api_key, OPENAI_MODEL, audio_path)
    else:
        raise SystemExit(f"Unknown whisper backend: {backend}")

    segments = _segments_from_response(response)
    if not segments:
        raise SystemExit("Whisper returned no transcript segments")

    print(f"[watch] transcribed {len(segments)} segments via {backend}", file=sys.stderr)
    return segments, backend


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: whisper.py <video-path> [<audio-out.mp3>]", file=sys.stderr)
        raise SystemExit(2)

    video = sys.argv[1]
    audio_out = Path(sys.argv[2]) if len(sys.argv) > 2 and not sys.argv[2].startswith("--") else Path("audio.mp3")
    segments, backend = transcribe_video(video, audio_out)
    print(json.dumps({"backend": backend, "segments": segments}, indent=2))
```

- [ ] **Step 2: Verify the adaptation — no Authorization header, openai backend, sentinel key**

Run:
```bash
cd /root/nanoclaw/container/skills/watch/scripts && python3 -c "
import whisper, pathlib, tempfile
# load_api_key always picks openai with the sentinel, even when asked for groq
assert whisper.load_api_key() == ('openai', 'onecli-managed'), whisper.load_api_key()
assert whisper.load_api_key('groq') == ('openai', 'onecli-managed')
# _post_whisper builds a Request with NO Authorization header.
# NOTE: whisper.py does 'from urllib.request import urlopen', so patch the name
# bound INSIDE the module (whisper.urlopen), not urllib.request.urlopen.
f = pathlib.Path(tempfile.mktemp(suffix='.mp3')); f.write_bytes(b'x')
captured = {}
def fake(req, *a, **k):
    captured['headers'] = {h.lower() for h in req.headers}
    raise SystemExit('stop-after-capture')
whisper.urlopen = fake
try:
    whisper._post_whisper(whisper.OPENAI_ENDPOINT, 'onecli-managed', 'whisper-1', f)
except SystemExit:
    pass
assert 'authorization' not in captured['headers'], captured['headers']
print('OK: openai+sentinel, no Authorization header sent')
"
```
Expected: `OK: openai+sentinel, no Authorization header sent`

- [ ] **Step 3: Commit**

```bash
git add container/skills/watch/scripts/whisper.py
git commit -m "feat(watch): whisper via OpenAI through OneCLI (no local key)"
```

---

### Task 4: Add the adapted setup.py (binary-only preflight)

**Files:**
- Create: `container/skills/watch/scripts/setup.py`

Single semantic change from upstream: `_have_api_key()` always reports the key as present (OneCLI injects it), so `--check` gates only on the required binaries. The macOS/brew installer paths are retained but never trigger in the Linux container.

- [ ] **Step 1: Copy upstream setup.py, then apply the one edit**

Run:
```bash
cp /root/.claude/plugins/cache/claude-video/watch/0.1.3/scripts/setup.py \
   /root/nanoclaw/container/skills/watch/scripts/setup.py
```

Then edit `container/skills/watch/scripts/setup.py`: replace the entire `_have_api_key` function (upstream lines 98-103) with:

```python
def _have_api_key() -> tuple[bool, str | None]:
    # NanoClaw: the OpenAI Whisper credential is injected by the OneCLI gateway
    # at request time (host pattern api.openai.com) and is never stored locally.
    # Treat it as always available so the preflight gates only on binaries.
    return True, "openai"
```

- [ ] **Step 2: Verify --check passes when binaries are present and exits 2 when not**

Run (this machine has ffmpeg/yt-dlp? it does not need them — we fake the lookup):
```bash
cd /root/nanoclaw/container/skills/watch/scripts && python3 -c "
import setup
# Key is always considered present now:
assert setup._have_api_key() == (True, 'openai')
# Status is binary-driven only:
import shutil
real = shutil.which
setup.shutil.which = lambda n: '/usr/bin/'+n   # pretend all binaries exist
assert setup.cmd_check() == 0, 'expected 0 when binaries present'
setup.shutil.which = lambda n: None            # pretend none exist
assert setup.cmd_check() == 2, 'expected 2 when binaries missing'
setup.shutil.which = real
print('OK: preflight gates on binaries only')
"
```
Expected: `OK: preflight gates on binaries only`

- [ ] **Step 3: Commit**

```bash
git add container/skills/watch/scripts/setup.py
git commit -m "feat(watch): binary-only preflight (OneCLI supplies the key)"
```

---

### Task 5: Write the NanoClaw-native SKILL.md

**Files:**
- Create: `container/skills/watch/SKILL.md`

- [ ] **Step 1: Write SKILL.md**

Create `container/skills/watch/SKILL.md` with this exact content:

````markdown
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
````

- [ ] **Step 2: Verify the SKILL.md frontmatter parses and paths are absolute**

Run:
```bash
cd /root/nanoclaw && head -6 container/skills/watch/SKILL.md && grep -c '/app/skills/watch/scripts/' container/skills/watch/SKILL.md
```
Expected: the YAML frontmatter (name: watch …) prints, and the grep count is ≥ 5 (all script references use the absolute mounted path, none use `${CLAUDE_SKILL_DIR}`).

- [ ] **Step 3: Commit**

```bash
git add container/skills/watch/SKILL.md
git commit -m "feat(watch): NanoClaw-native SKILL.md (absolute paths, OneCLI Whisper)"
```

---

### Task 6: Build, enable for Zory, and integration-test

**Files:** none (build + runtime config + live test)

- [ ] **Step 1: Rebuild the image so the new skill scripts are present**

The skill scripts are mounted from `container/skills/` at runtime (not baked), but rebuild to be sure binaries + tree are consistent:
```bash
./container/build.sh
```
Expected: clean build.

- [ ] **Step 2: Confirm the in-image frames+captions pipeline works (no proxy, real public video)**

This validates yt-dlp + ffmpeg + the four verbatim scripts end-to-end, independent of the gateway. Use a short, caption-bearing public video:
```bash
docker run --rm --entrypoint sh nanoclaw-agent:latest -c '
  python3 /app/skills/watch/scripts/watch.py "https://www.youtube.com/watch?v=aqz-KE-bpKQ" --max-frames 6 --out-dir /tmp/w 2>/tmp/err;
  echo "--- exit $? ---"; ls /tmp/w/frames | head; grep -c "^- \`/tmp/w/frames" /tmp/w_report 2>/dev/null;
  tail -5 /tmp/err'
```
Expected: frames `frame_0001.jpg …` exist in `/tmp/w/frames`, and stdout shows the `# watch: video report` markdown with frame paths and a `Transcript: … (via captions)` line. (Note: this path does NOT exercise the proxy; it confirms the heavy pipeline is sound. If yt-dlp fails here, it's a network/yt-dlp-version issue, not a gateway one.)

- [ ] **Step 3: Find Zory's OneCLI agent and set secret-mode to include OpenAI**

Auto-created agents start in `selective` secret-mode and get no secrets. Enable injection:
```bash
onecli agents list
# Find the agent whose identifier is the Zory group id: ag-1776222866725-qnziz1
onecli agents set-secret-mode --id <zory-agent-id> --mode all
onecli agents secrets --id <zory-agent-id>   # confirm "OpenAI" now appears
```
Expected: after `--mode all`, the OpenAI secret shows in Zory's assigned secrets. No container restart needed (injection is per-request).

- [ ] **Step 4: Restart so Zory picks up the rebuilt image / skill**

```bash
ncl groups restart --id ag-1776222866725-qnziz1
```
Expected: command succeeds; Zory's container will respawn on its next message.

- [ ] **Step 5: Live test through Zory (user-in-the-loop)**

Ask the user (Jonas) to send Zory, in the Telegram DM:
1. A short YouTube URL with a question (validates captions path through the real container): e.g. `/watch <youtube-url> resuma em 3 pontos`.
2. A caption-less clip or a `.mp4` in Zory's workspace (validates the **Whisper-via-OneCLI** path): e.g. `/watch <captionless-url>`.

Expected: Zory replies with a grounded summary citing timestamps. For test 2, the report header shows `whisper (openai)` — proving the gateway injected the OpenAI key. If test 2 returns a 401, re-check Step 3 (secret-mode) and the vault entry.

- [ ] **Step 6: Confirm no commit needed (runtime-only task)**

This task changes no tracked files. Nothing to commit.

---

### Task 7: Document the skill and record follow-ups

**Files:**
- Modify: `CLAUDE.md` (Skills/container-skills section — add `watch` to the container skills list)

- [ ] **Step 1: Note the skill in CLAUDE.md**

In `CLAUDE.md`, find the container-skills bullet under "## Skills" (the line listing `onecli-gateway`, `welcome`, `self-customize`, `agent-browser`, `slack-formatting`). Add `watch` to that list, and add a one-line row to the skills table:

```
| `/watch` | Watch/analyze a video (URL or local file) — frames + transcript. Enabled where the agent's container config includes it (Zory). |
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the /watch container skill"
```

- [ ] **Step 3: Surface remaining follow-ups to the user (not code)**

Remind Jonas of the two open items from the spec:
- **Rotate the OpenAI key** (it was pasted in plaintext during setup). Generate a new key, then
  `onecli secrets update --id 710b7d2d-f518-475d-93fb-d299fc431600 --value "<new-key>"`, then revoke the old one.
- **Expansion:** once Zory is validated, enabling `/watch` for other groups (Caio/Naia) is just a
  container-config skill-selection change — revisit when wanted.

---

## Self-review

**Spec coverage:**
- Base-image deps (ffmpeg/python3/yt-dlp) → Task 1. ✓
- Container skill + scripts → Tasks 2-5. ✓
- OneCLI credential adaptation (setup.py + whisper.py) → Tasks 3, 4. ✓
- Python CA through proxy → resolved in planning: scripts use `urllib`/system store, not `requests`/certifi; no edit needed (documented in "Key facts"). ✓
- yt-dlp through proxy → exercised in Task 6 Step 5 (live); Step 2 confirms the pipeline absent the proxy. NO_PROXY fallback noted in spec if Step 5 fails on download. ✓
- Exposure to Zory (`skills: all`) → Task 6 Step 4 (restart to pick up). ✓
- Zory secret-mode gotcha → Task 6 Step 3. ✓
- Rotate exposed key → Task 7 Step 3. ✓

**Placeholder scan:** `<zory-agent-id>` in Task 6 Step 3 is a runtime value discovered by `onecli agents list` in the same step — not a plan placeholder. `YT_DLP_VERSION` is a concrete pinned tag with a verify-first step. No TBD/TODO remain.

**Type/name consistency:** `load_api_key` returns `tuple[str, str]` and is called by the verbatim `watch.py` as `backend, api_key = load_api_key(args.whisper)` then `if backend and api_key:` — the sentinel is truthy, so the guard passes. `transcribe_video(video, audio_out, backend=, api_key=)` signature matches `watch.py`'s call site. `_have_api_key()` returns `(True, "openai")`, consumed by `_status()`/`cmd_check()` unchanged. Consistent.
