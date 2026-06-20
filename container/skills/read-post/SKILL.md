---
name: read-post
description: Archive an Instagram/TikTok/X post OR reel/video to Drive + a Google Sheet. Auto-detects the format — carousels/photos (cards → Drive, per-card text) and reels/videos (key frames → Drive, transcript) both land in one sheet, distinguished by a Tipo column. Use this to SAVE content for reference. For a throwaway "what's in this video" with no archiving, use /watch.
user-invocable: true
---

# /read-post — archive a post or reel into Drive + the content sheet

One command archives **any** Instagram / TikTok / X content link — it auto-detects
carousel vs reel/video, uploads the media to Drive, and gives you everything for one
sheet row. Nothing is kept on the server.

## ⚠️ Use the script. Do NOT improvise.

Run `archive.py` (below). **Do not** use Composio Instagram/Drive tools, do not invent
folder structures, do not save `.md` files. The script handles detection + download +
Drive upload + (for reels) transcription deterministically. You only read cards (carousels
only) and write the sheet row. Keep the turn lean and **always end with a `<message …>`
reply** — a turn with no message block sends nothing.

## Step 1 — archive (one command, auto-detects)

```bash
python3 /app/skills/read-post/scripts/archive.py "<url>"
```

The report tells you the **Tipo** and gives you the data for the row:

- **Carousel / photo** → `# read-post: image post / carousel`. Has metadata, a
  **`Drive folder:`** link (the card images), and each card's local path to `Read`.
- **Reel / video** → `# archive: reel / video`. Has metadata, **`Métrica (duração)`**,
  a **`Drive folder (keyframes)`** link, and the **`Conteúdo (transcrição)`** block —
  the transcript is already extracted; you do NOT need to read frames.

If a `Drive folder` shows `UPLOAD FAILED`, put the **post URL** in *Link mídia* and tell the user.

## Step 2 — read cards (CAROUSEL only)

For a **carousel** report, `Read` every card path **in one message** (parallel Reads) and
pull each card's text verbatim. For a **reel**, skip this — the transcript is the content.

## Step 3 — append one row to the sheet (Composio Sheets)

Ensure the spreadsheet **"Referências — Conteúdo"** exists (its id is cached in
`/workspace/agent/read-post-targets.json` — reuse it; if it still has the old title
"Referências — Carrosséis", rename it).

**Keep the sheet inside the Drive mother folder.** The script puts media under the
`Referências — Conteúdo` Drive folder; the sheet should live there too. Once (if not
already), move the spreadsheet into that folder via Composio (googledrive — search the
folder by name to get its id, then update the file's parents). Record `sheet_in_folder: true`
in `read-post-targets.json` so you don't redo it every run.

Header row (create/repair to match):

```
Data | Plataforma | Perfil | Link original | Tipo | Métrica | Legenda | Conteúdo | Card 1 | Card 2 | Card 3 | Card 4 | Card 5 | Card 6 | Card 7 | Card 8 | Card 9 | Card 10 | Link mídia
```

Append **one** row, mapping by type:

| Column | Carrossel / foto | Reel / vídeo |
|---|---|---|
| Data | post date `YYYY-MM-DD` | post/upload date |
| Plataforma | instagram/tiktok/twitter | instagram/tiktok/youtube/twitter |
| Perfil | `@handle — Nome` | `@handle` |
| Link original | post URL | post URL |
| **Tipo** | `carrossel` (>1) / `foto` (1) | `reel` |
| **Métrica** | Nº de cards | duração (ex `0:32`) |
| Legenda | caption | caption |
| **Conteúdo** | card text, numbered: `Card 1: … \| Card 2: …` | the **transcript** |
| Card 1 … Card 10 | each card's text | **leave blank** |
| **Link mídia** | the `Drive folder:` link | the `Drive folder (keyframes)` link |

Reuse the same spreadsheet every time — never create a second one. (>10 cards → cards
11+ only in *Conteúdo*.)

## Step 4 — clean up + reply

`rm -rf` the working dir the report named. Then **send a `<message>`** — **Telegram-safe**:
plain prose, **no tables / no `**bold**`**, and **every URL inside backticks**
(`` `https://…` ``) or it won't deliver. Content: tipo, profile, one line on the angle,
the backticked sheet link, and the backticked Drive link. Don't paste the content back.
