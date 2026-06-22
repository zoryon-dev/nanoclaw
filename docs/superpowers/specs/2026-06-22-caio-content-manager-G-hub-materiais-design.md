# Design — Caio Content Manager, Subsystem G: Brand Materials Hub (Notion)

**Date:** 2026-06-22
**Status:** Approved (design), pending implementation plan
**Initiative:** Extends the Caio Content Manager initiative (A–F, see memory `caio-content-manager-initiative`). G is additive — it does not change A–F. It closes the last gap in Caio's content ecosystem: the static brand **materials/assets** have no single navigable, brand-tagged index.

## Goal

Give Zoryon and Faryon a single **navigable, brand-tagged index of materials** in Notion — logos, brand books, design tokens, official docs, and (by linkage) the content Caio produces and archives. The hub is a **living registry**: a human (Jonas) browses it to find the right asset by brand; Caio reads it during creation and writes to it as new reusable assets appear.

Three roles, no duplication:
1. **Notion** = the navigable index + living registry (what exists, where it lives, which brand).
2. **Google Drive** = the canonical home of the actual files (Caio reads/writes natively).
3. **brand-wiki** (Subsystem A) = the *knowledge* Caio consumes (voice, personas, positioning). The hub points at material **files**; the wiki holds digested **knowledge**. They do not compete.

## Decisions (locked, user 2026-06-22)

- **Purpose:** living registry — both human browsing AND Caio uses/updates it.
- **File home:** Drive is the canonical home (`Materiais — Marca / Zoryon|Faryon`); R2 hosts only the subset that needs a public URL (brand-ref board for Magnific, web-facing images). Notion stores links, never the files.
- **Structure:** one new DB `Materiais — Marca` (static assets only) + a hub **page** that gathers the 3 DBs (Materiais + Referências + Entregas) in brand-filtered views. Not a mega-DB (distinct lifecycles), not a link-only page (assets must be queryable).
- **Seed:** seed now, with the brand assets that already exist (Zoryon + Faryon). This also finally gives `arquivos-empresa/` a durable home (the open item flagged in the Subsystem A spec).
- **Brand options:** `Zoryon` · `Faryon` · `Geral` (cross-brand / shared assets).

## Existing infrastructure (verified)

- **Notion via OneCLI gateway:** the container sends NO `Authorization` header; the gateway injects the Notion OAuth bearer for `api.notion.com`. Verified working for Caio's identifier `ag-1776256973199-ukacj8` with no per-agent grant. The integration only sees pages **shared with it** — currently the parent page **"Base | Nanoclaw"** (`386481dd-f843-800b-a775-d273d47e9ea1`), where both existing DBs live. Do NOT add a manual `ntn_…` token to the vault — it collides with the OAuth injection.
- **Two existing DBs under "Base | Nanoclaw"** (both already have a `Marca` select):
  - `Referências — Conteúdo` — DB `386481dd-f843-8146-b285-e3b0d818b842`, data source `386481dd-f843-8101-b564-000bfa3038d7` (refs archived by `/read-post`; `Marca` added 2026-06-22, commit 39a3dc2).
  - `Carrosséis — Entregas` — DB `94603584-af9a-4f9e-b190-cc8e4bac7f4c` (carousels Caio produces; `Marca` since Subsystem E).
- **Deterministic Notion writers** (`container/skills/read-post/scripts/notion_row.py`, `notion_delivery.py`): `curl -X POST api.notion.com/v1/pages`, DB id baked in, no auth header. `notion_asset.py` (this subsystem) follows the same shape.
- **Drive via native OAuth:** `container/skills/google-native/scripts/drive_upload.py` (and `read-post`'s `upload_drive.py`) POST to `*.googleapis.com` with no auth header; gateway injects. Scope `drive.file` + `drive.readonly` → Caio reads everything the user can access and read/writes files his app created.
- **R2 via Cloudflare v4 API:** `container/skills/r2-upload/scripts/r2_upload.py` — PUT to `api.cloudflare.com/client/v4/...` (gateway Bearer) → public URL `https://bucket-nanoclaw.zoryon.co/<key>`. Verified live (Subsystem E).
- **Skills are mounted read-only** (`container/skills` → `/app/skills`, `src/container-runner.ts:346`) — a new/edited script is live on Caio's next spawn, no image rebuild.
- **Caio config cache** `groups/content-machine/read-post-targets.json` already holds Drive roots + the two DB ids; the new DB id + the `Materiais — Marca` Drive root go here too.
- **Raw asset drop** `arquivos-empresa/` (gitignored): `zoryon-brand/BRAND/` (logos `.svg`, `design-tokens.css`, `tailwind.zoryon.js`, `zoryon-brand-book.html`) + `DOCS-OFICIAIS/*.md`; `faryon-brand/BRAND/` (`logo.svg`, `logo-reverso.svg`, `icon.svg`, `design-tokens.css`, `paleta.json`) + `06-Identidade-Visual/`, `07-Naming-e-Marca/`, key project docs. The Zoryon brand-ref board already exists at `groups/content-machine/brand/zoryon-brand-ref.png`.

## Components

### 1. DB `Materiais — Marca` (new)
Created under "Base | Nanoclaw" (so Caio's gateway integration sees it automatically). Schema:

| Property | Type | Notes |
|---|---|---|
| `Material` | title | asset name |
| `Marca` | select | `Zoryon` · `Faryon` · `Geral` |
| `Tipo` | select | `Logo` · `Brand book` · `Design tokens` · `Paleta` · `Tipografia` · `Doc oficial` · `Template` · `Brand-ref` · `Outro` |
| `Arquivo (Drive)` | url | canonical Drive link |
| `URL pública (R2)` | url | optional — only assets needing a public URL |
| `Formato` | select | `SVG` · `PNG` · `PDF` · `CSS` · `MD` · `JSON` · `Outro` |
| `Notas` | text | what it is / when to use |

Created via the claude.ai Notion MCP (`notion-create-database` / `update-data-source`) from the host — same path used to add `Marca` to the references DB. Its data-source id is captured for the hub views and for `notion_asset.py`.

### 2. `notion_asset.py` (new deterministic writer)
Lives in `container/skills/read-post/scripts/` alongside its siblings (same skill, same auth model). Flags:
`--material` (title, required) · `--marca Zoryon|Faryon|Geral` (required) · `--tipo` (required) · `--drive <url>` · `--r2 <url>` · `--formato` · `--notas`. Builds the Notion page payload deterministically, POSTs with no auth header, prints the page URL. DB id baked in (resolved at implementation). Optional body via `--body-file` (e.g. an asset description), matching the sibling scripts.

### 3. Hub page `Materiais & Conteúdo — por Marca`
A Notion page under "Base | Nanoclaw" with **linked-database views** of all three DBs (Materiais, Referências, Entregas), organized into a **Zoryon** section and a **Faryon** section, each filtered `Marca = <brand>`. Built via the Notion MCP. This is the single browsable entry point; it owns no data of its own.

### 4. Caio tooling instruction (living registry)
Add a short section to Caio's `system-prompt.md` + `CLAUDE.local.md` (both gitignored): when Jonas shares — or Caio produces — a **reusable brand asset**, catalog it: upload the file to Drive (`Materiais — Marca / <marca>`) via `drive_upload.py`; if it needs a public URL, also `r2_upload.py`; then `notion_asset.py` records the row. Distinguish from `/read-post` (external references) and the delivery log (produced carousels).

### 5. Seed (curated, brand-namespaced) — also the end-to-end validation
Curate the high-value asset subset for both brands (logos, design tokens/palette, brand books, official docs; brand-ref board for Zoryon) — exact list fixed at plan time, mirroring the Subsystem A curation discipline. Execute **through Caio's gateway** (a one-off run of Caio's image with the container config applied — the established off-channel test pattern, see memory `project-watch-skill`): stage the curated files into Caio's workspace → `drive_upload.py` into `Materiais — Marca / Zoryon|Faryon` → `r2_upload.py` for the public-needed ones (logos, brand-ref) → one `notion_asset.py` row per asset. Running the seed through the real tooling validates `notion_asset.py` + the Drive/R2 path in one pass.

## Data flow

```
brand asset (logo / brand book / design tokens / doc)
  → Drive: "Materiais — Marca" / {Zoryon|Faryon}/   (drive_upload.py, canonical home)
  → (if public-needed) R2: bucket-nanoclaw.zoryon.co/<key>   (r2_upload.py)
  → Notion row in "Materiais — Marca"   (notion_asset.py: Marca, Tipo, Arquivo(Drive), URL pública(R2), Formato, Notas)
  → surfaced in the hub page under the brand's section

Hub page "Materiais & Conteúdo — por Marca"
  └ Zoryon: [Materiais] [Referências] [Entregas]   (linked views, Marca=Zoryon)
  └ Faryon: [Materiais] [Referências] [Entregas]   (linked views, Marca=Faryon)
```

## Verification

1. DB `Materiais — Marca` exists under "Base | Nanoclaw" with the schema above; its data-source id is recorded.
2. `notion_asset.py` py-compiles; a dry test row (Marca/Tipo/Drive set) creates a page and prints its URL via Caio's gateway (HTTP 200).
3. Seed: each curated asset has a Drive link (and R2 URL where applicable) and one Notion row; brands are namespaced correctly.
4. Hub page renders the three DBs split into Zoryon / Faryon sections, each correctly filtered.
5. Live smoke (Caio DM, user-side): "cataloga esse asset da Faryon: <link/arquivo>" → Caio uploads + creates the row; "me mostra os materiais da Zoryon" → he points to the hub / queries Materiais filtered by brand.

## Commit / install-specific notes

- `notion_asset.py`, the SKILL.md update, and this spec are **committable** (generic skill/infra; `container/skills/**` is tracked).
- The Notion DB/page, Drive files, R2 objects, `read-post-targets.json`, `system-prompt.md`, and `CLAUDE.local.md` are **install-specific** (live data / gitignored) — not committed.
- `arquivos-empresa/` stays gitignored; the seed reads from it but does not commit it.
- No manual Notion token in the vault (OAuth injection is the single source of truth).

## Out of scope

- Versioning / approval status on assets (no `Status`/`Versão` field now — add later if a real need appears).
- Migrating the existing References/Deliveries DBs (untouched; they already carry `Marca`).
- Auto-ingesting every file in `arquivos-empresa/` — only the curated high-value subset, like Subsystem A.
- Any change to A–F behavior.
