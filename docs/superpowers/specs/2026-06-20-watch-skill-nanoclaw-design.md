# Design: Port the `/watch` skill into NanoClaw

**Date:** 2026-06-20
**Status:** Approved (pending spec review)
**Source skill:** `bradautomates/claude-video` → `watch` v0.1.3 (installed as a Claude Code plugin on the host)
**Test agent:** Zory (`ag-1776222866725-qnziz1`, folder `dm-with-jonas`)

## Goal

Give NanoClaw container agents the ability to "watch" a video (URL or local file): download it
with `yt-dlp`, extract frames with `ffmpeg`, obtain a timestamped transcript (native captions
first, Whisper API fallback), then let the agent `Read` the frames + transcript to answer
questions about the video.

The upstream skill is a host-side Claude Code plugin and does not run inside NanoClaw's agent
containers. "Making it work in NanoClaw" means porting it to a **container skill** plus the
runtime dependencies and credential model the container environment requires.

## Why it doesn't just work today

- NanoClaw agents run inside isolated Docker containers (Bun runtime). The only way to grant a
  new capability is a **container skill** (`container/skills/`) mounted read-only at `/app/skills`,
  plus any binaries baked into the image.
- The base image (`node:22-slim`) has **none** of the required binaries: no `ffmpeg`/`ffprobe`,
  no `python3`/`pip`, no `yt-dlp`.
- The upstream skill reads a Whisper API key from `~/.config/watch/.env` and builds the
  `Authorization` header itself. NanoClaw forbids secrets in env/chat/disk — credentials are
  injected transparently by the **OneCLI gateway** at the HTTPS proxy boundary. The container
  must send the request with **no** auth header; OneCLI injects it.

## Decisions (settled)

- **Transcription backend:** Whisper via **OpenAI** (`api.openai.com/v1/audio/transcriptions`),
  credential injected by OneCLI. The OpenAI secret is already in the vault
  (`id 710b7d2d-f518-475d-93fb-d299fc431600`, host `api.openai.com`, header `Authorization`,
  format `Bearer {value}`). **Action item:** this key was exposed in plaintext during setup and
  should be rotated once the feature is validated.
- **Single phase:** ship frames + native captions + Whisper together (no captions-only phase 1).
- **Exposure:** Zory's container config is `"skills": "all"`, so dropping `container/skills/watch/`
  in the tree exposes it to Zory automatically. No per-group skill-selection edit needed.

## Architecture / Components

### 1. Base-image dependencies (`container/Dockerfile`)
Extend the existing `apt-get install` block (line ~32) to add `ffmpeg` (provides `ffprobe`) and
`python3` + `python3-pip`. Install `yt-dlp` pinned to an exact version. Pinning approach to be
finalized in the plan; preferred is the standalone release binary or `pip install yt-dlp==<ver>`
into a known path. yt-dlp ships frequent releases — pin deliberately, do not float.

Size impact: roughly +150–250 MB. Acceptable; available to any group but only surfaced where the
skill is enabled.

### 2. Container skill (`container/skills/watch/`)
- `SKILL.md` — adapted from upstream. Drops the macOS/Homebrew install path and the
  `~/.config/watch/.env` key-management instructions. Step 0 preflight becomes a binary-presence
  check only (binaries are guaranteed by the image; no installer, no key prompt). Keeps the
  invocation flow (parse input → run `watch.py` → `Read` frames → answer → cleanup) and the
  frame-budget/focus-mode guidance.
- `scripts/` — the six Python scripts (`watch.py`, `download.py`, `frames.py`, `transcribe.py`,
  `whisper.py`, `setup.py`), adapted as below.

### 3. OneCLI credential adaptation (the core change)
- `setup.py`: in `--check`, **do not** fail when no local API key is present. Under NanoClaw the
  key never lives locally. Reduce preflight to: required binaries present? If yes, exit 0.
- `whisper.py`: send the transcription request to `api.openai.com` **without** constructing an
  `Authorization` header from a local key. The OneCLI gateway injects it. Honor `HTTPS_PROXY`
  (standard HTTP clients do this automatically).
- `transcribe.py`: keep native-caption-first ordering; fall back to the OpenAI request when
  captions are absent.

### 4. TLS trust for Python through the OneCLI proxy
OneCLI does TLS interception, so outbound HTTPS must trust the OneCLI CA. Python's `requests`
uses its bundled `certifi`, **not** the system CA store, so it will reject the proxied
connection unless pointed at the OneCLI CA. The plan must set `REQUESTS_CA_BUNDLE` /
`SSL_CERT_FILE` (and/or `pip install` use of the system store) to the CA the container already
trusts. The exact CA path is whatever `container-runner.ts` wires for the gateway; the plan will
locate it and thread it to the Python scripts (env var in the skill, or `verify=` in the client).

### 5. yt-dlp through the proxy
`HTTPS_PROXY` is set container-wide, so `yt-dlp` routes its downloads through OneCLI too. The plan
must verify yt-dlp can download public videos through the gateway (same CA-trust concern as #4,
plus confirming the gateway passes through hosts it has no secret for). If interception breaks
downloads, the fallback is a scoped `NO_PROXY` for download hosts. Resolve during Phase-1 testing.

## Data flow

```
user sends video URL/path to Zory (Telegram DM)
  → agent invokes /watch
  → watch.py: yt-dlp download (via proxy)  → frames.py: ffmpeg extract JPEGs
                                            → transcribe.py: captions? yes → use them
                                                                        no  → whisper.py → api.openai.com
                                                                              (OneCLI injects key)
  → script prints frame paths + transcript report
  → agent Reads each frame (rendered as images) + reads transcript
  → agent answers, citing timestamps
  → agent cleans up working dir
```

## Error handling

- Missing binaries (should never happen post-build) → preflight prints the missing list; agent
  reports it rather than silently proceeding.
- No captions AND Whisper fails (401/timeout/upload limit) → proceed frames-only, tell the user.
- 401 from OpenAI → means OneCLI has no/invalid OpenAI secret or Zory's secret-mode excludes it
  (see below). Surface the OneCLI connect/error guidance.
- Download fails (login/region-locked) → report plainly, do not retry-loop.

## Zory secret-mode gotcha

Auto-created agents start in OneCLI `selective` secret mode — the OpenAI secret will not be
injected for Zory until its mode includes it. The plan must, as a test step:
`onecli agents list` → find Zory's agent → `onecli agents set-secret-mode --id <id> --mode all`
(or assign the specific secret id). No container restart needed; injection is per-request.

## Testing plan

1. Build image: `./container/build.sh`; confirm `ffmpeg -version`, `python3 --version`,
   `yt-dlp --version` inside the image.
2. Confirm Zory picks up the skill (`skills: all`) and the binaries resolve.
3. Set Zory's OneCLI secret-mode to include OpenAI.
4. **YouTube-with-captions test:** send a short YouTube URL to Zory; expect frames + native-caption
   transcript + a grounded answer. Validates yt-dlp-through-proxy and the frame pipeline.
5. **Whisper test:** a video without captions (or a local `.mp4`); expect Whisper transcription via
   OpenAI through OneCLI. Validates the credential adaptation + Python CA trust.
6. Confirm working-dir cleanup.

## Out of scope

- Exposing `/watch` to other groups (Caio, Naia, etc.) — revisit after Zory validates.
- Groq backend (decided OpenAI).
- Any change to the host-side Claude Code plugin (it stays as-is for host use).

## Risks summary

| Risk | Mitigation |
|------|------------|
| Python `requests` ignores system CA → SSL failure through proxy | Set `REQUESTS_CA_BUNDLE`/`SSL_CERT_FILE` to the OneCLI CA the container trusts |
| yt-dlp download breaks through the intercepting proxy | Verify in test 4; fall back to scoped `NO_PROXY` |
| Zory in `selective` secret-mode → 401 from OpenAI | Set secret-mode to `all` (or assign secret) as a test step |
| Image-size growth (~150–250 MB) | Accepted; `--no-install-recommends`, pinned yt-dlp |
| Exposed OpenAI key | Rotate after validation; update vault via `onecli secrets update` |
