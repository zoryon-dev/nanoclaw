# Design — Caio Content Manager, Subsystem B: Research (Pesquisa)

**Date:** 2026-06-21
**Status:** Approved (design), pending implementation plan
**Initiative:** Evolve Caio (content-machine) into a Content Manager. Subsystem **B of six** (A–F). See memory `caio-content-manager-initiative`. Depends on nothing hard; complements A (brand wiki) — research findings cross-reference the brand pillars/voice in `/workspace/brand-wiki`.

## Goal

Give Caio a rationalized **research toolkit** for the ideation stage: trend discovery ("temas quentes"), factual/topic research, and reference gathering — each tool with a distinct role, no blind redundancy. Research is **read-only** by default; curated findings persist on demand.

## Decisions (locked, user 2026-06-21)

- **Web research = BOTH** Firecrawl (deep scrape/crawl/extract/search) **and** Tavily CLI (search + autonomous research). User accepts the overlap for maximum coverage.
- **Firecrawl via its own MCP server** (not gateway-proxied) — user-provided key. The MCP, not a CLI.
- **Tavily** = CLI skill — user-provided Tavily API key → OneCLI vault (gateway injects for `api.tavily.com`); no key in the container/config.
- **last30days = zero-config scope** — Reddit, Hacker News, Polymarket, GitHub + synthesis via `OPENROUTER_API_KEY` (already in vault). 7-day default window. No premium social keys (X/ScrapeCreators/Brave) this round — YouTube is already covered by the `youtube-search` skill.
- **YouTube research** — already shipped (`container/skills/youtube-search/`, commit 809bde1) + on-demand Notion reference (commit 970906b).
- **Persistence** — consistent with the YouTube model: read-only by default; a chosen reference → "Referências — Conteúdo" Notion (via `notion_row.py`); a reusable brief/synthesis → Caio's own wiki; last30days raw output → a research dir in Caio's workspace.
- **Magnific is NOT in B** — it is media *production*, belongs to Subsystem D (criação multi-formato).

## The toolkit (4 tools, distinct roles)

| Tool | Role | Integration | Status |
|---|---|---|---|
| **youtube-search** | YouTube discovery, temas quentes, channel/competitor analysis | container skill (Data API via gateway, `key=onecli-managed`) | ✅ shipped |
| **Firecrawl** | deep web: scrape a page, crawl a site, LLM-extract structured data, web/news search with full content | **MCP server** (Caio `container_configs.mcp_servers`), user key | to build |
| **Tavily** | web search + `tavily-research` (autonomous cited report), extract/map/crawl | container skill (`tvly` CLI in Dockerfile + skill scripts), key via vault | to build |
| **last30days** | multi-platform social trend synthesis (Reddit/HN/Polymarket/GitHub), engagement-scored, cited brief | container skill (vendored Python), `--days=7`, OpenRouter synthesis | to build |

## Component details

### B1 — Firecrawl MCP (re-add)
Add a Firecrawl MCP server to Caio's `container_configs.mcp_servers`:
```json
"firecrawl": { "type": "http", "url": "https://mcp.firecrawl.dev/<FIRECRAWL_KEY>/v2/mcp" }
```
- `<FIRECRAWL_KEY>` = the user-provided key (stored in the DB config only — group runtime files are gitignored; never committed). This is the same shape Caio's pre-trim config used.
- Tools surfaced: `firecrawl_scrape`, `firecrawl_search`, `firecrawl_crawl` (+`_check_crawl_status`), `firecrawl_map`, `firecrawl_extract`, `firecrawl_agent`. Apply via `ncl groups config add-mcp-server` (or direct DB update) + restart.
- Verify: from Caio's session, a `firecrawl_scrape` of a known URL returns markdown.

### B2 — Tavily CLI (container skill)
- **Dockerfile:** install the `tvly` CLI pinned (the install script from the Tavily tutorial), in the same global-install block as the other agent CLIs. Triggers a Caio per-agent image `--rebuild`.
- **Skill:** `container/skills/tavily/` — SKILL.md wrapping the `tvly` commands (`search`, `research`, `extract`, `map`, `crawl`) with content-research recipes; scripts as needed. Calls `api.tavily.com` with **no key in the script** — the OneCLI gateway injects the Tavily key (host pattern `api.tavily.com`).
- **Credential:** the user-provided Tavily key → `onecli secrets create` (vault), host pattern `api.tavily.com`, granted to Caio's agent. **Until stored, the Tavily skill is staged but returns 401/unauthorized.**
- Verify: `tvly search "<term>"` from Caio's container returns results; `tvly research` produces a cited report.

### B3 — last30days (vendored container skill)
- **Vendor:** copy the upstream `mvanhorn/last30days-skill` `scripts/` (Python 3.12+) into `container/skills/last30days/scripts/` + a NanoClaw-flavored SKILL.md. The `-g` host install does NOT reach the container, so it must be vendored into the image path `/app/skills/last30days/`.
- **Dockerfile:** ensure Python 3.12+ and the skill's pip deps are present (Caio's image already has python3; add any missing deps). Rebuild.
- **Default window:** wrap invocation so `--days=7` is always applied (weekly roundup), per the initiative.
- **Platforms (zero-config):** Reddit, Hacker News, Polymarket, GitHub. **Synthesis:** `OPENROUTER_API_KEY` (vault, gateway-injected). Premium platforms (X, YouTube transcripts, Brave, Perplexity) explicitly OFF — `log()`/note that they're skipped so coverage isn't silently overstated.
- **Output:** raw `.md` to `/workspace/agent/research/last30days/` (Caio's writable workspace).
- Verify: `last30days "<topic>" --days=7` runs end-to-end, writes a brief, no premium-key errors block it.

### B4 — Decision matrix (Caio's CLAUDE.local.md)
Add a "Pesquisa — quando usar qual" block:
- **Temas quentes / o que está bombando num nicho** → `youtube-search` (vídeo) + `last30days` (social Reddit/HN).
- **Âncora factual / dado / estatística pra um carrossel** → Tavily (`search`/`research`).
- **Extrair ou analisar uma página/site específico (concorrente, landing, artigo)** → Firecrawl (`scrape`/`extract`/`crawl`).
- **Tendência social com engajamento real (upvotes, discussão)** → `last30days`.
- Always cross-reference findings against the brand pillars/voice in `/workspace/brand-wiki/` before proposing themes.

## Persistence model (consistent across all research tools)

- **Default: read-only.** Research surfaces information; it writes nothing automatically.
- **On-demand reference** → "Referências — Conteúdo" Notion via `notion_row.py` (e.g. a competitor post found via Firecrawl, a trending video via youtube-search). Only when the user says "salva essa referência". Never bulk-save.
- **Reusable brief/synthesis** → Caio's own wiki: `/workspace/agent/wiki/topicos/tendencias-<nicho>.md` (so a good "temas quentes" pass isn't re-derived next week).
- **last30days raw** → `/workspace/agent/research/last30days/` (kept out of the wiki; it's raw, not synthesized).

## Credentials handling (security)

- Tavily key + (if ever) any premium key → **OneCLI vault**, gateway-injected by host pattern. Never in a committed file.
- Firecrawl key → Caio's `container_configs.mcp_servers` (DB / materialized `container.json` only; group runtime files are gitignored). Never in a committed file.
- The spec, plan, and memory reference keys by name only — **no raw values**.
- Keys were pasted in chat 2026-06-21; recommend rotation if the channel isn't fully trusted.

## Image rebuild

Tavily CLI + last30days Python deps go into Caio's **per-agent image** (he already has a custom image: `nanoclaw-agent-v2-7545d4f2:ag-1776256973199-ukacj8`, custom apt `python3-pil`/`imagemagick`). Per the watch-skill memory rule, adding tools requires `ncl groups restart --id ag-1776256973199-ukacj8 --rebuild` (clearing image_tag won't work — he needs the custom packages). Firecrawl (MCP) and youtube-search (already shipped) need no image change.

## Verification (end-to-end)

1. Firecrawl: `firecrawl_scrape` of a URL from Caio's session → markdown.
2. Tavily: after key in vault, `tvly search` + `tvly research` from Caio's container → results / cited report.
3. last30days: `--days=7` run writes a brief to `/workspace/agent/research/last30days/`, zero-config platforms only, no blocking errors.
4. Decision matrix present in CLAUDE.local; brand-wiki cross-reference noted.
5. Live smoke (Caio DM): "me dá um panorama de tendências sobre IA para pequenos negócios" → Caio uses the right mix (youtube-search + last30days + Tavily/Firecrawl), synthesizes against brand pillars, offers to save a reference.

## Out of scope (this subsystem)

- **Magnific** / any media generation — Subsystem D.
- Premium social keys (X/ScrapeCreators/Brave/Perplexity) for last30days — deferred.
- The Content-Manager persona rewrite that orchestrates these tools end-to-end — Subsystem C.
- Auto-logging of all research (rejected: on-demand only).
- Scheduling/editorial calendar — Subsystem E.
