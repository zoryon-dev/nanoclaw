---
name: read-post
description: Archive an Instagram/TikTok/X post OR reel/video to Drive + a Notion database. Auto-detects the format — carousels/photos (cards → Drive, per-card text) and reels/videos (key frames → Drive, transcript) both land in one Notion database, distinguished by a Tipo property. Use this to SAVE content for reference. For a throwaway "what's in this video" with no archiving, use /watch.
user-invocable: true
---

# /read-post — archive a post or reel into Drive + the content database (Notion)

One command archives **any** Instagram / TikTok / X content link — it auto-detects
carousel vs reel/video, uploads the media to Drive, and gives you everything for one
Notion row. Nothing is kept on the server.

## ⚠️ Use the scripts. Do NOT improvise.

Run `archive.py` then `notion_row.py` (below). **Do not** use Composio Instagram/Drive
tools, do not invent folder structures, do not save `.md` files, do not hand-write the
Notion API JSON. `archive.py` handles detection + download + Drive upload + (for reels)
transcription deterministically; `notion_row.py` builds the Notion page deterministically.
You only read cards (carousels only) and pass the fields to the writer. Keep the turn lean
and **always end with a `<message …>` reply** — a turn with no message block sends nothing.

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

## Step 3 — create one row in Notion (`notion_row.py`)

Write the post's **content** to a plain-text file first, then call the writer. The
content goes in the page body (not a property):

- **Reel / vídeo** → the file is just the **transcript** from the report.
- **Carrossel** → one block per card: a `## Card N` line, then that card's text. E.g.:

  ```
  ## Card 1
  <card 1 text>

  ## Card 2
  <card 2 text>
  ```

Then run the writer (the database id is baked in — never pass it):

```bash
python3 /app/skills/read-post/scripts/notion_row.py \
  --tipo <reel|carrossel|foto> \
  --plataforma <instagram|tiktok|x|youtube> \
  --perfil "@handle — Nome" \
  --data YYYY-MM-DD \
  --link "<post URL>" \
  --drive "<Drive folder link from the report>" \
  --metrica "<duração ex 0:32  |  Nº de cards>" \
  --tema "tag1,tag2" \
  --marca <Zoryon|Faryon> \
  --legenda-file <caption.txt> \
  --body-file <content.txt>
```

Field mapping by type:

| Flag | Carrossel / foto | Reel / vídeo |
|---|---|---|
| `--tipo` | `carrossel` (>1 card) / `foto` (1) | `reel` |
| `--plataforma` | instagram/tiktok/x | instagram/tiktok/youtube/x |
| `--perfil` | `@handle — Nome` | `@handle` |
| `--metrica` | Nº de cards | duração (ex `0:32`) |
| `--drive` | the `Drive folder:` link | the `Drive folder (keyframes)` link |
| `--body-file` | `## Card N` blocks | the **transcript** |

`--data`, `--link`, `--legenda-file`, `--tema`, `--marca` are optional but fill them when you have them
(`--tema` is for browsing later — add 1–3 short tags about the angle/format). `--marca` tags which
of our brands this reference informs (`Zoryon` or `Faryon`) — set it when the angle clearly serves
one brand (e.g. a due-diligence/imobiliário reference → `Faryon`; an IA-aplicada-a-negócios one →
`Zoryon`); leave it off for generic inspiration that fits neither. The script
prints the **Notion page URL** on success; keep it for the reply. If it prints `ERRO…`,
relay that to the user instead of pretending it saved. **Never** create a second database
or pass a database id — there is exactly one, baked into the script.

## Step 4 — clean up + reply

`rm -rf` the working dir the report named (and any temp `caption.txt`/`content.txt`). Then
**send a `<message>`** — **Telegram-safe**: plain prose, **no tables / no `**bold**`**, and
**every URL inside backticks** (`` `https://…` ``) or it won't deliver. Content: tipo,
profile, one line on the angle, the backticked **Notion** link, and the backticked Drive
link. Don't paste the content back.
