# Brown — Link & Docs Librarian Agent

**Date:** 2026-06-24
**Status:** Approved, in implementation
**Owner:** Jonas (jonas.silva@zoryon.dev)

## Purpose

A dedicated NanoClaw agent ("Brown") whose **single, locked-down function** is to be a
personal **base of links and documentation**. The user fires links at it via a dedicated
Telegram bot; Brown extracts info, summarizes, categorizes, and persists to Notion, then
answers "do I have a link about X?" with a synthesized response.

**Hard scope guardrail:** Brown talks about *nothing else*. Any off-topic request is
politely refused and redirected to its purpose. No general assistant behavior.

## Positioning

- **Own, independent agent group** (folder `brown`) with a **dedicated Telegram bot**
  (token managed in container config). NOT backstage, NOT folded into Caio.
- Rationale: link capture is a *capture* gesture (fire-and-forget), a distinct domain from
  Caio's content-production references, and keeping it standalone lets the Lobby reach it
  later via a single added wiring with zero rework.

## Knowledge layers (3)

1. **Notion DB `Links — Biblioteca`** (new, in the "Base | Pessoal" workspace) — structured
   write store.
   Properties:
   - `Title` (title) — resource title
   - `URL` (url)
   - `Categoria` (select, fixed list): `Repo Git`, `Inspiração Site`, `Artigo`,
     `Ferramenta`, `Vídeo`, `Doc/Referência`, `Outro`
   - `Tags` (multi-select, free, with reuse — agent reads existing tags before choosing)
   - `Resumo` (rich text) — short summary
   - `Nota` (rich text) — Jonas's optional comment
   - `Data` (created_time) — auto
   - Page body: longer distilled summary / extracted highlights.
2. **Own LLM wiki** (karpathy-llm-wiki) in `groups/brown/wiki` — each relevant link distills
   knowledge (`conceitos/entidades/topicos/index/log`). Semantic memory.
3. **Cross-wiki read-only** — mount `groups/dm-with-jonas/wiki` (Zory),
   `groups/content-machine/wiki` (Caio), `groups/lobby/wiki` read-only at `extra/wikis/*`
   for cross-context during queries.

## Capture flow (skill `/save-link`)

Detect link type by URL and extract specialized:
- **GitHub** (`github.com/owner/repo`) → public API (`description`, stars, language,
  topics) + README → summary. Categoria `Repo Git`.
- **YouTube** (`youtube.com`, `youtu.be`) → `yt-dlp` title + captions → summary.
  Categoria `Vídeo`. Best-effort: fall back to title+metadata if no captions.
- **X/Twitter** (`x.com`, `twitter.com`) → post text (best-effort).
- **Everything else** → firecrawl (markdown) → summary; agent infers categoria.

Then: read existing Tags → pick categoria + tags → **dedup** (normalize URL, check if it
already exists; if so, warn and show the existing record) → write to Notion → distill into
own wiki → reply with a synthesis (title, categoria, tags, Notion link).

MVP extras: **dedup**, **multi-link in one message** (process all), **note alongside**
(non-URL text in the message becomes `Nota`). Save-confirmation/correction loop deferred.

## Query flow

"Do I have a link about X?" → interpret → query Notion (categoria/tags/text) + own wiki +
cross-wikis → **synthesized answer** with the top 2-3 most relevant + link.

## Infra / credentials

All via the OneCLI gateway in `all` secret mode (no raw creds in container):
- **Notion** — OAuth already in vault (finance/naia/content-machine use it). Create the new
  DB via the `notion-db` skill / its CLI. Gotcha: NO manual `ntn_` token in vault (collides
  with OAuth).
- **Firecrawl** — reuse the wiring Zory already has.
- **GitHub** — public API, no auth. **yt-dlp** — already in the container image.
- **Bot** — Telegram token `8906718357:…` set in Brown's container config; host registers
  the adapter instance (restart required to start polling).

## Definition of done / success criteria

1. Brown agent group exists, container spawns, Telegram bot is live and responds.
2. Sending a link → correct type-specific extraction → row in `Links — Biblioteca` with
   categoria + tags + resumo; dedup works; multi-link works; note captured.
3. Asking "tenho link sobre X?" → synthesized answer from Notion (+ wiki when populated).
4. Off-topic message → polite in-scope refusal (guardrail verified).
5. Own wiki scaffold present; cross-wikis mounted RO.

**Fallback (if full live wiring blocked):** ensure the backend is fully structured and
organized — Notion DB created with the schema above, `/save-link` skill + extraction logic
complete and committed, agent group + persona + guardrails authored, so only the final
host-side bot registration remains.

## Process constraints (owner-set)

- Commit per task; commit + push per cycle of tasks.
- Record each material decision in agent memory.
- Authorized to iterate autonomously until done or 3 error attempts on a blocker.
- Goal: 100% efficacy.
