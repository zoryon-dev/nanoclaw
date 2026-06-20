---
name: read-post
description: Read an image post or carousel (Instagram /p/, TikTok photo slideshow, X images) — downloads every card, extracts each card's text by vision, and records ONE row in a Google Sheet. Use for static posts/carousels; for Reels/videos use /watch.
user-invocable: true
---

# /read-post — read an image post / carousel into a Google Sheet

Turns a static post or carousel link into one structured sheet row: caption +
per-card text + metadata. Nothing is kept on the server — the working files are
deleted after recording.

Covers **Instagram** (`/p/` posts, carousels, single photos), **TikTok** photo
slideshows, **X/Twitter** image posts. For **Reels / videos**, use **/watch**.

## ⚠️ Keep this turn LEAN

You carry many MCP tools, so this task can blow your context if you wander. Do the
**minimum**: run the script once → read the cards once (one batched Read) → append
**one** sheet row → reply. Don't over-search Composio (one focused search per action).
**You MUST end the turn with a `<message …>` reply to the user** — a turn with no
message block sends nothing, which looks like a freeze. Even if a step fails, send a
short message saying what you got.

## Step 1 — download the cards

```bash
python3 /app/skills/read-post/scripts/gallery.py "<post-url>"
```

Prints post metadata (platform, profile, caption, date, count) + each card's path,
in order (already downscaled for cheap reading). Cookies are used automatically.
If it errors **"use /watch instead"**, the link is a video — switch to `/watch`.

## Step 2 — read the cards (one batch)

`Read` every card path **in a single message** (parallel Reads). For each card pull
its text **verbatim** (hooks, numbered lists, CTAs). Keep it tight — you don't need
to describe the design, just capture the text.

## Step 3 — append one row to the sheet (Composio)

Ensure a spreadsheet named **"Referências — Carrosséis"** exists (search once; create
if missing). On creation write this header row:

```
Data | Plataforma | Perfil | Link original | Tipo | Nº cards | Legenda | Texto consolidado | Card 1 | Card 2 | Card 3 | Card 4 | Card 5 | Card 6 | Card 7 | Card 8 | Card 9 | Card 10 | Link imagens
```

Append **one** row:
- **Data** — post date `YYYY-MM-DD` · **Plataforma** — instagram/tiktok/twitter
- **Perfil** — `@handle — Nome` · **Link original** — post URL
- **Tipo** — `carrossel` (>1 card) / `foto única` (1 card) · **Nº cards** — count
- **Legenda** — full caption
- **Texto consolidado** — every card's text in one cell, numbered: `Card 1: … | Card 2: … | …`
- **Card 1 … Card 10** — each card's text in its own column (extras blank; >10 cards → only in *Texto consolidado*)
- **Link imagens** — the **original post URL** (the images live there). Drive
  archival is a later phase; do **not** upload images now — that's what overloaded
  this turn before.

Reuse the same spreadsheet every time — never create a second one. (Optional: cache its
id in `/workspace/agent/read-post-targets.json` so later runs skip the search.)

## Step 4 — clean up + reply

`rm -rf` the working directory. Then **send the user a `<message>`**: profile, nº of
cards, one line on the carousel's angle, and the sheet link. Don't paste all the text
back — it's in the sheet.
