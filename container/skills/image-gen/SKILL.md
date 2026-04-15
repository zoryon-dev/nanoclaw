---
name: image-gen
description: Generate images from text prompts via OpenRouter (Gemini 2.5 Flash Image / Nano Banana). Use whenever an agent needs to produce an image — product shots, editorial photos, illustrations, concept art. Returns a path to a PNG on disk that can be attached to an outbound message. The agent should ALREADY have a well-crafted prompt when calling this (Lad specializes in authoring prompts; image-gen only executes).
allowed-tools: Bash(image-gen:*)
---

# image-gen — Nano Banana image synthesis

This skill executes image generation. **Prompt quality is the caller's responsibility** — this tool will faithfully pass whatever prompt it receives to the model. For Zoryon, the Lad agent owns prompt engineering; Grow (or any agent with this skill) just calls `image-gen generate`.

## Usage

```bash
image-gen generate "<detailed prompt in English>" [--aspect RATIO] [--out PATH]
```

- `--aspect`: `1:1` (default), `16:9`, `9:16`, `3:4`, `4:3`
- `--out`: output PNG path. Default: `/tmp/image-gen-<timestamp>.png`

## Output format

JSON on stdout. Parse it before attaching the file.

**Success:**
```json
{"ok": true, "path": "/tmp/image-gen-1776261000-4242.png", "bytes": 842199, "aspect": "16:9"}
```

**Failure:**
```json
{"ok": false, "error": "…", "upstream_status": 400}
```

## Prompt quality hints (if you must build one without Lad)

- Always English, 80–150 words, ordered as: subject → action → environment → lighting → camera/lens → style → composition → grading → negative.
- Include concrete attributes: age, ethnicity (if given), clothing, posture, emotion, lens (85mm / 50mm / 35mm), aperture (f/1.8 / f/2.8 / f/4), camera height.
- Include a style anchor: editorial photograph, cinematic still, documentary, etc. Avoid stacking multiple incompatible styles.
- End with `--negative: blurry, distorted hands, extra limbs, text artifacts, watermark`.

## Credentials

The OneCLI gateway injects `Authorization: Bearer <OPENROUTER_API_KEY>` automatically for any request to `openrouter.ai`. No API key setup inside the container.

## Delivery to the user

After `image-gen` returns a successful path, the agent's standard outbound flow should:
1. Write an outbound message with `files: ["<basename of path>"]` and copy the PNG into `outbox/<message-id>/` within the session.
2. The host delivery loop attaches the PNG and sends it through the channel adapter.

## ⚠️ DO NOT Read the generated PNG

Never use the `Read` tool (or `cat`, `xxd`, etc.) on the returned `path`. Claude Code's Read returns image bytes as multimodal content, which gets included in the agent's next API call — and Anthropic rejects the full request with `"Could not process image"`, breaking the entire flow. Trust the JSON (`ok:true` + path) as confirmation; move the file with `cp` only.

## Failure modes

- `upstream_status: 400` — prompt is likely malformed or contains blocked content. Rephrase.
- `upstream_status: 402` — OpenRouter credits exhausted. Tell the user.
- `upstream_status: 429` — rate limited. Retry after a short delay.
- `error: "no image in response"` — model returned text only. Re-prompt with stronger "generate an image of..." framing.
- `error: "unrecognized image reference"` — API response shape changed. Check the raw response preview in the failure payload.
