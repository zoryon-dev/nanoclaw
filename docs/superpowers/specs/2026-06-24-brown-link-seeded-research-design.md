# Brown — Link-Seeded Research

**Date:** 2026-06-24
**Agent group:** `brown` (`b335198d-2904-4b41-b92a-015cdc71c956`)
**Status:** Design approved, pending spec review

## Problem / Goal

Today Brown is a link **librarian**: send a link → it extracts, summarizes, categorizes,
and saves the post itself to Notion (`Links — Biblioteca`); ask a question → it searches
what's stored. A separate `research` mode (skill `research`) does topic research, but it's
triggered by a *text request* ("acha repos sobre X"), not by a link.

The owner wants Brown to flip the link behavior: a link should be a **seed/reference for
deep research on its theme**, not something archived as-is. Modeled on Caio's "send a link,
it figures everything out" UX — but where Caio *archives the content*, Brown *researches the
theme behind it and saves the research*.

## Decisions (locked during brainstorming)

1. **Trigger:** Every link to Brown now triggers link-seeded research. The old
   "capture the link as-is" mode is **replaced** (the link still gets cataloged, but as a
   research seed, not as the saved artifact).
2. **Bare link (no instruction):** Fully **autonomous** — resolve, infer the central theme,
   research it, save, report. An accompanying instruction (e.g. "vai a fundo em X disso")
   **steers** the research. Brown never stops to ask first.
3. **Output:** **Both, cross-linked.** A wiki page holds the compiled research (the real
   knowledge); a Notion entry catalogs the seed link as a reference pointing to the wiki page.
4. **Link resolution:** Brown gets its **own lightweight, text-only resolver** — caption for
   carousels, transcript for reels — reusing the proven cookie + `gallery-dl`/`yt-dlp` infra
   but **without** downloading media or uploading to Drive. Non-IG links resolve via Firecrawl
   (sites/articles/X) or `yt_meta` (YouTube), as Brown already does.
5. **Depth:** **Moderate** — reuse Brown's existing `research` skill (GitHub + Firecrawl +
   Tavily, ~5–6 sources, synthesize the best). No heavy multi-round harness.

The **Consulta** mode ("tenho algo sobre X?") is unchanged. The **scope guardrail** is
unchanged — Brown still only does links/docs + research + Consulta and refuses everything
else in one line.

## Flow

```
link [+ optional instruction]
  → 1. RESOLVE link → text
        IG/TikTok carousel → caption (gallery-dl, text only, no media/Drive)
        IG/TikTok reel      → transcript (yt-dlp audio → Whisper via OneCLI/OpenAI)
        site / article / X  → Firecrawl
        YouTube             → yt_meta / transcript
        (resolution fails → tell the owner in one line, ask for pasted caption; do NOT invent)
  → 2. INFER central theme (or use the owner's instruction if present)
  → 3. RESEARCH the theme — skill `research` (GitHub + Firecrawl + Tavily, ~5–6 sources)
  → 4. COMPILE into a wiki page — skill `wiki` (essence + cross-refs + wiki/log.md entry),
        page at wiki/topicos/<tema>.md
  → 5. CATALOG in Notion (`Links — Biblioteca`) — seed link as reference → points to wiki page
  → 6. REPORT to the owner: what was found + where it was saved (wiki page + Notion entry)
```

Autonomous end-to-end; the owner is only addressed in step 6 (or step 1 on a resolution
failure). Reply always via the `jonas` destination.

## Data model

### Wiki (the content)
The compiled research lives as a topic page under `groups/brown/wiki/topicos/<tema>.md`,
created/updated through the `wiki` skill (extract essence, build cross-references, append a
`wiki/log.md` entry). This is what Consulta reads later. Do not dump the raw post or raw
search results — compile.

### Notion (`Links — Biblioteca`, the catalog)
One entry per seed link. **No schema change except one new `Categoria` option.** Existing
DB (`389481dd-f843-81b5-a077-e4a24e5fc438`), properties reused:

| Property | Value |
|----------|-------|
| `url` | the seed link |
| `url_key` | dedup key from `linkinfo.py` (as today) |
| `categoria` | **new select option `Pesquisa`** — distinguishes a research seed from a plain capture |
| `resumo` | short abstract of the research |
| `nota` | pointer to the wiki page (e.g. `wiki/topicos/<tema>.md`) |
| `tags` | reuse `tags.md` vocabulary (add new tags only when nothing fits) |
| `title` | derived theme title |

The wiki↔Notion link is a **text pointer** in `nota` (the wiki is files, not a Notion
relation target).

### Dedup
On a repeat link (same `url_key`): **update** the existing wiki page + Notion entry and tell
the owner "já pesquisei isso, atualizei" — never create a duplicate.

## Components

- **`resolve.py`** (new, Brown-side, lightweight): detect platform → return text only.
  - IG/TikTok carousel/photo → `gallery-dl` caption extraction (no media kept).
  - IG/TikTok reel/video → `yt-dlp` audio → Whisper transcription (OneCLI/OpenAI).
  - site / article / X → Firecrawl (`firecrawl_scrape`).
  - YouTube → existing `yt_meta`/transcript path.
  - Reuses the proven extraction commands from Caio's `read-post`/`archive.py` but **strips
    the Drive-upload and media-archival steps** — output is text + minimal metadata only.
- **`link-research` skill** (new): orchestrates the flow — calls `resolve.py`, then the
  `research` skill, then the `wiki` skill, then `notion_db.py`, then reports. This is the
  single entry point the persona points at for any incoming link.
- **`research` skill** (existing, reused): GitHub + Firecrawl + Tavily, ~5–6 sources.
- **`wiki` skill** (existing, reused): compile + cross-ref + log.
- **`notion-db` / `notion_db.py`** (existing, reused): write/update the catalog entry.
- **`save-link` skill** (existing): retire the capture path; keep the Consulta path it already
  defines. The persona stops pointing at capture and points links at `link-research` instead.

## Persona / scope changes (`groups/brown/CLAUDE.local.md`)

- Change the mode description: **"Mensagem com link(s) → modo pesquisa-com-semente"** (resolve
  → pesquisa → salva wiki+Notion → relata), replacing "link → captura".
- Keep **Consulta** unchanged.
- Keep the **scope guardrail** verbatim — Brown only does links/docs + research + Consulta;
  refuses anything else in one line, sober tone.
- Keep the data/clock rule.

## Infra to provision (Brown container)

- Binaries: `gallery-dl`, `yt-dlp`, `ffmpeg` (pinned, via the Dockerfile pnpm/apt blocks per
  the supply-chain rules — not ad-hoc installs).
- Secret: IG/TikTok cookies (the same set Caio uses), injected via OneCLI (never in chat/env).
- Skills list (`container.json`): add `link-research`; keep `research`, `wiki`, `notion-db`,
  `tavily`, `firecrawl` (MCP), `onecli-gateway`, `self-customize`.

## Error handling & edge cases

- **Resolution failure** (private post, expired cookie, unsupported URL): one-line notice to
  the owner asking for the pasted caption/text; never fabricate the post content.
- **Link unresolvable but explicit topic given:** research the owner's topic anyway, using the
  link as a reference URL in the Notion entry.
- **Multiple links in one message:** process each as its own research + entry, sequentially.
- **Reel cost (accepted):** carousels are cheap (caption only); reels incur audio download +
  Whisper transcription per reel. Acceptable per owner.
- **Telegram delivery:** Brown sends via its own bot; the merged plain-text fallback
  (PR #3, `buildTelegramAdapter`) already protects it from malformed-entity drops.

## Out of scope (YAGNI)

- Heavy multi-round research harness (deep-research style).
- Archiving the post's media (that's Caio's `read-post`; Brown keeps only text + research).
- Asking the owner what to research before starting (autonomous by decision #2).
- A Notion relation field for the wiki link (text pointer in `nota` suffices).

## Success criteria

- Sending Brown an Instagram carousel or reel link with no instruction yields: a resolved
  theme, a compiled wiki page on that theme, a Notion `Pesquisa` entry pointing to it, and a
  one-message report — with no intermediate questions.
- Sending the same link again updates rather than duplicates.
- A non-link message still hits the unchanged scope guardrail.
- Consulta still answers from Notion + wiki.
