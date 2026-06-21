# Design — Caio Content Manager, Subsystem A: Brand Wiki

**Date:** 2026-06-21
**Status:** Approved (design), pending implementation plan
**Initiative:** Evolve Caio (content-machine) from carousel-maker into a full Content Manager. This is the **first of six subsystems** (A–F). See the memory note `caio-content-manager-initiative` for the full decomposition and the architecture decision (Caio = orchestrator + backstage specialists).

## Goal

Give both Zory and Caio access to curated **brand knowledge** (Zoryon + Faryon) through the existing LLM-wiki, and give Caio a **second, private wiki** he owns for operational self-learning (content decisions, flows, what worked).

Two wikis, two roles:
1. **Shared brand/knowledge wiki** — Zory's existing wiki (`groups/dm-with-jonas/wiki`). Zory is the sole maintainer/writer. Caio mounts it **read-only** and consults it (voice, personas, positioning) while creating content.
2. **Caio's own wiki** — `/workspace/agent/wiki/` inside Caio's container (host: `groups/content-machine/wiki`). Caio is the sole owner/writer. Holds his decisions, flows, learnings. The `wiki` container skill already operates on this path out of the box.

This split means **one writer per wiki directory** — no cross-mount write contention, and it honors the `wiki` skill's "single owner" rule.

## Decisions (locked)

- **Sharing model:** Option 1 — Zory maintains the shared wiki, Caio reads it RO. PLUS Caio gets his own RW wiki. (User, 2026-06-21.)
- **Ingestion scope:** high-value subset (~140KB, ~20 clean markdown docs across both brands). Exclude binaries/HTML/CSS/SVG/PDF/raw-research. (User, 2026-06-21.)
- **Ingestion method:** Approach A — batch compilation via subagents writing wiki pages directly into Zory's wiki dir, in the Karpathy LLM-wiki structure. Zory maintains incrementally afterward. (User, 2026-06-21.)

## Existing infrastructure (verified)

- `wiki` container skill (`container/skills/wiki/SKILL.md`): Karpathy LLM-wiki pattern. Layers: raw sources at `/workspace/agent/sources/`, compiled pages at `/workspace/agent/wiki/` (`index.md`, `log.md`, `entidades/`, `conceitos/`, `topicos/`, `comparacoes/`). Agent reads each source, extracts the essence, integrates into pages, keeps cross-references + index + chronological log.
- Zory's wiki already exists at `groups/dm-with-jonas/{wiki,sources}`. Zory has the `wiki` skill (her refactor made her the wiki owner).
- Caio has the `wiki` skill in his curated skill list but **no wiki data and no mount** today — his `/workspace/agent/wiki` would be empty (`groups/content-machine/` has no `wiki/`).
- `arquivos-empresa/` sits **untracked in the repo root** — the user's raw drop. It needs a home.

## Components

### 1. Source staging
Copy the curated subset (clean markdown only) from `arquivos-empresa/` into Zory's wiki raw layer, namespaced by brand:
- `groups/dm-with-jonas/sources/marca/zoryon/`
- `groups/dm-with-jonas/sources/marca/faryon/`

**Zoryon subset:**
- `DOCS-OFICIAIS/02-posicionamento-marca.md`
- `DOCS-OFICIAIS/03-avatares-icps.md`
- `DOCS-OFICIAIS/01-business-overview.md`
- `DOCS-OFICIAIS/05-catalogo-servicos.md`
- `DOCS-OFICIAIS/09-estrategia-conteudo.md`
- `DOCS-OFICIAIS/00-PROJETO-BASE.md`
- `BRAND/brand-voice-guide.md`

**Faryon subset:**
- `BRAND/brand-voice-guide.md`
- `00-INDICE-MASTER.md`
- `00-RESUMO-EXECUTIVO.md`
- `08-Personas/Personas-FARYON.md`
- `07-Naming-e-Marca/NAMING-HANDOFF.md`
- `01-Documentos-Projeto/v0.7-fronteira-juridica-e-nomenclatura.md`
- `01-Documentos-Projeto/v1.0-sintese-pesquisas-mercado.md`
- `01-Documentos-Projeto/v0.9-camadas-definidas.md`

**Exclude:** all SVG/PNG/JPG/PDF/DOCX, HTML brand-books/panels, CSS/JS/YAML/JSON, `.DS_Store`, `claude-design-upload/` duplicates, `Pesquisas-Brutas/`.

The tutorials (`tavily-tutorial.md`, `firecrawl-tutorial-mcp.md`) and `magnific-auth.skill` are **NOT** wiki sources — they belong to Subsystem B and stay staged for that work.

After staging, the original `arquivos-empresa/` folder is kept as a gitignored staging archive (or removed) — decided at implementation time; it is not committed to the repo regardless.

### 2. Brand ingestion (batch via subagents)
Spawn focused subagents, each compiling one coherent slice of the brand sources into wiki pages written directly under `groups/dm-with-jonas/wiki/`, following the skill's structure. Suggested page plan:
- `entidades/zoryon.md` — what Zoryon is (overview, model, services).
- `entidades/faryon.md` — what Faryon is.
- `conceitos/pilares-de-conteudo-zoryon.md` — the 4 content pillars.
- `conceitos/personas-zoryon.md` — the 2 ICPs (Operador Travado, Construtor Solo).
- `conceitos/personas-faryon.md` — the 4 Faryon personas.
- `topicos/voz-e-tom-zoryon.md` and `topicos/voz-e-tom-faryon.md` — voice/tone guides.
- `topicos/posicionamento-zoryon.md`, `topicos/posicionamento-faryon.md` — positioning, enemy beliefs.
- `topicos/catalogo-servicos-zoryon.md` — service catalog/flow.
- `topicos/naming-e-mercado-faryon.md` — naming logic + market synthesis + legal boundary.
- Update `wiki/index.md` (new entries grouped by category) and append `wiki/log.md` (`## [2026-06-21] ingest | marca Zoryon+Faryon`).

Pages are markdown, kebab-case, cross-linked. This produces real pages now; Zory extends incrementally via her `wiki` skill thereafter.

### 3. Caio's mounts (two wikis)
Update Caio's container config (`container_configs` / `additional_mounts`) so his container gets:
- **Brand wiki, RO:** host `groups/dm-with-jonas/wiki` → container `/workspace/brand-wiki` (read-only). Live view of Zory's wiki.
- **Own wiki, RW:** ensure `groups/content-machine/{wiki,sources}` exist on host (scaffold empty with `index.md`/`log.md`); they mount at the standard `/workspace/agent/{wiki,sources}` (already Caio's writable workspace — no extra mount needed, just the directories).

Apply via `ncl groups config update` (add the brand-wiki mount) + `ncl groups restart` so the next spawn sees it.

### 4. Caio CLAUDE.local.md conventions
Add a short "Wikis" section to `groups/content-machine/CLAUDE.local.md`:
- **`/workspace/brand-wiki/` (RO, marca):** consult before creating — voice, personas, positioning, pillars. Read `index.md` first, then the relevant page. Never write here.
- **`/workspace/agent/wiki/` (RW, sua):** your own knowledge base. Record content decisions, flows that worked, learnings, recurring briefs. You own it (the `wiki` skill operates here).
- Distinguish from `CLAUDE.local.md` (behavior memory) and Mem (Zory's tool).

## Data flow

```
arquivos-empresa/ (raw drop)
  → curated subset (clean markdown, brand-namespaced)
  → groups/dm-with-jonas/sources/marca/{zoryon,faryon}/
  → [batch compile via subagents]
  → groups/dm-with-jonas/wiki/** (entidades/conceitos/topicos + index + log)
  → (RO mount) → Caio /workspace/brand-wiki/  → Caio reads while creating

Caio /workspace/agent/wiki/ (RW)  → Caio writes his own decisions/flows/learnings
```

## Verification

1. After staging: the subset files exist under `groups/dm-with-jonas/sources/marca/`, binaries excluded.
2. After compile: `groups/dm-with-jonas/wiki/index.md` lists the new brand pages; pages exist and cross-link; `log.md` has the ingest entry.
3. After mount + restart: from Caio's container, `/workspace/brand-wiki/index.md` is readable (RO) and shows the brand pages; `/workspace/agent/wiki/` is writable (touch test).
4. Smoke: ask Caio (in Caio DM) "qual a voz da Zoryon?" / "quais os pilares de conteúdo?" — he answers from `/workspace/brand-wiki/` without re-deriving.

## Commit / install-specific notes

- Wiki content, sources, and group runtime files live under `groups/**` and are **install-specific (gitignored)** — not committed.
- `arquivos-empresa/` is **not** committed.
- Committable/shippable from this subsystem: only generic skill or infra changes, if any arise (e.g., a doc note). The `wiki` skill itself is unchanged. The spec doc (this file) and memory are committed.

## Out of scope (this subsystem)

- Research tools (Tavily/Firecrawl/last30days), Magnific — Subsystem B.
- Caio's Content-Manager persona rewrite — Subsystem C.
- Multi-format creation, scheduling, audit — D/E/F.
- Faryon "everything" ingestion and raw-research — deferred; only the high-value subset now.
- Ongoing wiki maintenance automation — Zory does it via the skill as new sources arrive.
