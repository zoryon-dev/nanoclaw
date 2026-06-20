---
name: read-post
description: Read an image post or carousel (Instagram /p/, TikTok photo slideshow, X images) — downloads every card, extracts each card's text by vision, uploads the images to Google Drive, and records ONE row in a Google Sheet. Use for static posts/carousels; for Reels/videos use /watch.
user-invocable: true
---

# /read-post — read an image post / carousel into Drive + a Google Sheet

Turns a static post or carousel link into: the card images archived in Google Drive,
and one structured sheet row (caption + per-card text + metadata + Drive link). Nothing
is kept on the server — the working files are deleted after recording.

Covers **Instagram** (`/p/` posts, carousels, single photos), **TikTok** photo
slideshows, **X/Twitter** image posts. For **Reels / videos**, use **/watch**.

## ⚠️ Keep this turn LEAN

You carry many MCP tools, so this can blow your context if you wander. Do the
**minimum**: run script → read cards once (one batched Read) → run upload script →
append **one** sheet row → reply. The Drive upload is a SCRIPT (not Composio tool
calls) precisely so it stays off your context. **You MUST end the turn with a
`<message …>` reply** — a turn with no message block sends nothing.

## Step 1 — download the cards

```bash
python3 /app/skills/read-post/scripts/gallery.py "<post-url>"
```

Prints metadata (platform, profile, caption, date, count) + each card's path, in order.
Note the **working dir** it prints (cards are in `<work>/cards`). Cookies are automatic.
If it errors **"use /watch instead"**, the link is a video — switch to `/watch`.

## Step 2 — read the cards (one batch)

`Read` every card path **in a single message** (parallel Reads). For each card, pull its
text **verbatim** (hooks, numbered lists, CTAs). Keep it tight — capture the text, don't
describe the design.

## Step 3 — upload the images to Drive (script)

```bash
python3 /app/skills/read-post/scripts/upload_drive.py "<work>/cards" --name "<date> — @<handle> — <shortcode>"
```

It creates a subfolder under a "Referências — Carrosséis" Drive folder, uploads every
card, makes it link-readable, and prints **one line: the Drive folder link**. Capture it.

- If it errors **"not granted to this agent"**, the OneCLI Google Drive grant is missing —
  tell the user to grant Drive to this agent, and put the **post URL** in *Link imagens*
  for now so the row still gets written.

## Step 4 — append one row to the sheet (Composio)

Ensure a spreadsheet **"Referências — Carrosséis"** exists (search once; create if missing).
On creation write this header row:

```
Data | Plataforma | Perfil | Link original | Tipo | Nº cards | Legenda | Texto consolidado | Card 1 | Card 2 | Card 3 | Card 4 | Card 5 | Card 6 | Card 7 | Card 8 | Card 9 | Card 10 | Link imagens
```

Append **one** row:
- **Data** `YYYY-MM-DD` · **Plataforma** instagram/tiktok/twitter · **Perfil** `@handle — Nome`
- **Link original** post URL · **Tipo** `carrossel`/`foto única` · **Nº cards** count
- **Legenda** full caption
- **Texto consolidado** every card's text in one cell, numbered: `Card 1: … | Card 2: … | …`
- **Card 1 … Card 10** each card's text in its own column (extras blank; >10 → only consolidated)
- **Link imagens** the **Drive folder link** from Step 3 (or the post URL if the upload wasn't granted)

Reuse the same spreadsheet every time — never create a second one.

## Step 5 — clean up + reply

`rm -rf` the working directory. Then **send a `<message>`** — keep it **Telegram-safe**:
plain prose, **no tables / no `**bold**` blocks**, and **put any URL inside backticks**
(`` `https://…` ``) — sheet/Drive URLs contain `_` which breaks Telegram's Markdown
otherwise. Content: profile, nº of cards, one line on the angle, the backticked sheet
link, and the backticked Drive link. Don't paste the extracted text back.
