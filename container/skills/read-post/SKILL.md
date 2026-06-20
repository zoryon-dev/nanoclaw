---
name: read-post
description: Read an image post or carousel (Instagram /p/, TikTok photo slideshow, X images) — downloads every card, uploads them to Google Drive, extracts each card's text by vision, and records ONE row in a Google Sheet. Use for static posts/carousels; for Reels/videos use /watch.
user-invocable: true
---

# /read-post — image post / carousel → Drive + a Google Sheet

One command downloads the cards AND archives them to Drive. You then read the cards
for their text and write one sheet row. Nothing is kept on the server — the working
files are deleted after.

Covers **Instagram** (`/p/` posts, carousels, single photos), **TikTok** photo
slideshows, **X/Twitter** image posts. For **Reels / videos**, use **/watch**.

## ⚠️ Use the script. Do NOT improvise.

There is exactly one right way to do this — the script below. **Do not** use Composio
Instagram/Drive tools, do not invent your own folder structure, do not save `.md` files.
The script handles download + Drive upload deterministically; you only read the cards and
write the sheet. Keep the turn lean and **always end with a `<message …>` reply** (a turn
with no message block sends nothing).

## Step 1 — download + upload (one command)

```bash
python3 /app/skills/read-post/scripts/gallery.py "<post-url>" --drive
```

This downloads every card AND uploads them to a `Referências — Carrosséis` Drive folder.
The report it prints includes:
- metadata (platform, profile, shortcode, date, count, caption),
- **`Drive folder:`** — the shareable link to this post's images (use it in the sheet),
- the local path of each card.

Notes:
- If it errors **"use /watch instead"**, the link is a video → use `/watch`.
- If the report shows **`Drive folder: UPLOAD FAILED …`**, put the **post URL** in the
  sheet's *Link imagens* column instead, and mention it to the user.

## Step 2 — read the cards (one batch)

`Read` every card path the report lists, **in a single message** (parallel Reads). For each
card, pull its text **verbatim** (hooks, numbered lists, CTAs). Capture the text; don't
describe the design.

## Step 3 — append one row to the sheet (Composio Sheets)

Ensure the spreadsheet **"Referências — Carrosséis"** exists (its id may be cached in
`/workspace/agent/read-post-targets.json` — reuse it; otherwise search once, create if
missing). On creation write this header row:

```
Data | Plataforma | Perfil | Link original | Tipo | Nº cards | Legenda | Texto consolidado | Card 1 | Card 2 | Card 3 | Card 4 | Card 5 | Card 6 | Card 7 | Card 8 | Card 9 | Card 10 | Link imagens
```

Append **one** row:
- **Data** `YYYY-MM-DD` · **Plataforma** instagram/tiktok/twitter · **Perfil** `@handle — Nome`
- **Link original** post URL · **Tipo** `carrossel`/`foto única` · **Nº cards** count
- **Legenda** full caption
- **Texto consolidado** every card's text in one cell, numbered: `Card 1: … | Card 2: … | …`
- **Card 1 … Card 10** each card's text in its own column (extras blank; >10 → only consolidated)
- **Link imagens** the **`Drive folder:`** link from Step 1's report

Reuse the same spreadsheet every time — never create a second one.

## Step 4 — clean up + reply

`rm -rf` the working directory the report named. Then **send a `<message>`** — keep it
**Telegram-safe**: plain prose, **no tables / no `**bold**` blocks**, and **put every URL
inside backticks** (`` `https://…` ``) — sheet/Drive URLs contain `_` which breaks
Telegram's Markdown otherwise. Content: profile, nº of cards, one line on the angle, the
backticked sheet link, and the backticked Drive link. Don't paste the extracted text back.
