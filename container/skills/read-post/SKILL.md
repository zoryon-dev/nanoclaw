---
name: read-post
description: Read an image post or carousel (Instagram /p/, TikTok photo slideshow, X images) — downloads every card, extracts the text of each card by vision, then records it to a Google Sheet and uploads the images to Google Drive (via Composio). Use for static posts/carousels; for Reels/videos use /watch.
user-invocable: true
---

# /read-post — read an image post / carousel

Turns a static post or carousel link into a structured reference: one sheet row
per post (caption + per-card text + metadata) and the card images in Drive. Nothing
is kept on the server — the working files are deleted after upload.

Covers **Instagram** (`/p/` posts, carousels, single photos), **TikTok** photo
slideshows, and **X/Twitter** image posts. For **Reels / videos**, use **/watch**.

## Step 1 — download the cards

```bash
python3 /app/skills/read-post/scripts/gallery.py "<post-url>"
```

It prints the post metadata (platform, profile, caption, date, card count) and the
local path of each card, in order. Cookies (the same `/watch` file) are used
automatically for IG/TikTok/X.

- If it errors with **"use /watch instead"**, the link is a video — switch to `/watch`.
- If download fails with an auth error, the platform cookies are missing/expired —
  tell the user; don't retry.

## Step 2 — read every card

`Read` each card image path the script listed. For each card, extract its text
**verbatim** (keep hooks, numbered lists, CTAs, the slide's role). Note in one line
the visual style if relevant (cover / list slide / CTA). Vision reads stylized
carousel typography directly — do not use a separate OCR tool.

## Step 3 — record to the Google Sheet (Composio)

Ensure a spreadsheet named **"Referências — Carrosséis"** exists (search Drive/Sheets;
create it if missing). On creation, write this exact header row:

```
Data | Plataforma | Perfil | Link original | Tipo | Nº cards | Legenda | Texto consolidado | Card 1 | Card 2 | Card 3 | Card 4 | Card 5 | Card 6 | Card 7 | Card 8 | Card 9 | Card 10 | Pasta Drive
```

Append **one row** for this post:
- **Data** — post date (from the report, `YYYY-MM-DD`)
- **Plataforma** — instagram / tiktok / twitter
- **Perfil** — `@handle — Nome`
- **Link original** — the post URL
- **Tipo** — `carrossel` (>1 card) or `foto única` (1 card)
- **Nº cards** — count
- **Legenda** — the post caption (full)
- **Texto consolidado** — every card's text in one cell, numbered: `Card 1: … | Card 2: … | …`
- **Card 1 … Card 10** — each card's text in its own column (leave extras blank; if a
  post has >10 cards, cards 11+ live only in *Texto consolidado*)
- **Pasta Drive** — link to this post's Drive subfolder (from Step 4)

Reuse the same spreadsheet for every post — never create a second one. (Optional: cache
the spreadsheet id + Drive folder id in `/workspace/agent/read-post-targets.json` so
later runs skip the search.)

## Step 4 — upload the images (Composio Google Drive)

Ensure a Drive folder **"Referências — Carrosséis"** exists (create if missing). Inside
it, create a subfolder named `<data> — @<handle> — <shortcode>` and upload every card
image from the working dir into it. Put that subfolder's shareable link in the
**Pasta Drive** column.

If the Composio Drive tool cannot upload a local container file directly, do **not**
block the whole flow: still write the sheet row (the text is the core deliverable),
put `"(imagens não enviadas — ver post original)"` in **Pasta Drive**, and tell the
user so we can adjust the upload method.

## Step 5 — clean up

Delete the working directory the script printed (`rm -rf <work-dir>`). Nothing persists
on the server.

## Step 6 — reply

Short confirmation: profile, nº of cards, a one-line gist of the carousel's angle, the
sheet link, and the Drive folder link. Don't paste all the extracted text back unless
asked — it's already in the sheet.

## Notes

- **Composio pattern:** use `COMPOSIO_SEARCH_TOOLS` → `COMPOSIO_MULTI_EXECUTE_TOOL` with
  the `googlesheets` and `googledrive` toolkits (read auto; creating/uploading is the
  expected action for this skill, no extra confirmation needed).
- **Video cards inside a carousel:** the report marks them `(video)`. You can't read a
  video as an image — note "card N: vídeo" in that card's cell and move on.
- **Token cost:** the cards are images. A 10-card carousel is ~10 image reads. Read them
  in one batch (parallel Read calls).
