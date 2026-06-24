# Sheets → Notion migration (Finance + Naia) — execution record

**Date:** 2026-06-23/24 · **Status:** Data migrated + verified + tested; agents repointed. One human-gated check pending (first real card-confirmed write).

This documents the migration of the two personal Sheets-backed agents — **Finance (Levis)** and **Naia (nutrition/health)** — onto Notion databases under the page **"Base | Pessoal"** (`388481dd-f843-80a1-b09d-ce0d9e67cc3e`). Design spec: [docs/superpowers/specs/2026-06-23-sheets-to-notion-personal-base-design.md](superpowers/specs/2026-06-23-sheets-to-notion-personal-base-design.md). Foundation plan: [docs/superpowers/plans/2026-06-23-notion-db-foundation.md](superpowers/plans/2026-06-23-notion-db-foundation.md).

## Decisions (locked with the owner)
- **Notion is the single source of truth.** Google Sheets is **frozen** (read-only, not fed, **not deleted**) as a ~2-week safety net.
- **All historical data migrated** (with row-count verification).
- **Agent computes derived values on demand** (deltas, % adesão, dashboards) — only raw data is stored.
- **v1 storage types:** every column is Notion **text**, except a few low-cardinality **selects** (`tipo`, `escopo`, `status`, `origem`, `frequencia`, `intestino`, `flag`, `tipo`/`profissional` for eventos, `refeicao`). **No relations** in v1 (cross-references like `categoria`, `conta_origem` are plain text). This made the backfill bulletproof against type-coercion failures on real data; column types/relations can be upgraded later in the Notion UI.

## Foundation: the `notion-db` container skill (on `main`)
`container/skills/notion-db/` — a generic, schema-driven Notion CRUD helper used by both agents. Built TDD via the superpowers workflow; reviewed (opus, ready-to-merge); 16/16 stdlib tests green.
- `notion_db.py` — verbs `create-row | query | update | archive | create-db`, gateway-proxied HTTPS to `api.notion.com` with **no Authorization header** (OneCLI injects the Notion bearer), `Notion-Version: 2022-06-28`. Driven by a per-agent JSON schema mapping logical field → Notion property + type. Undo = `archive` (soft-delete). `--match <field>=<value>` supports title/text/number/select.
- `backfill_sheets.py` — one-time Sheets→Notion loader (reads via the native `gsheets/sheets_api.py`), with `--colmap identity` (derive column map from the sheet header row) and `--require-field <key>` (drop filler/template rows whose key column is empty). `--id-field __nodedup__` disables dedup for a clean first load.
- `run_tests.py` — stdlib test runner (the host has no pytest).

## Execution mechanism
The migration runs **inside each agent's container** (the OneCLI gateway injects the Google Sheets and Notion tokens there; the host cannot read the sheet or write Notion directly). Operator commands were issued via **standalone** `docker exec <agent-container> …` (the command must start with `docker exec` to match the allow-rule). Both agents were flipped from OneCLI `secretMode: selective` → `all` so the gateway injects the Notion token (this is what caused the initial 401; reversible).

## Result — Finance (11 databases, 96 rows)
Live Notion page counts verified == source counts:

| Database | key | rows | match field |
|---|---|---|---|
| Lançamentos PF | `lancamentos_pf` | 2 | id |
| Lançamentos PJ | `lancamentos_pj` | 3 | id |
| Recorrentes | `recorrentes` | 35 | id |
| Recebíveis | `recebiveis` | 1 | id |
| Categorias | `categorias` | 4 | nome |
| Subcategorias | `subcategorias` | 13 | nome |
| Contas | `contas` | 6 | id |
| Meios de pagamento | `meios_pagamento` | 6 | id |
| Decisões | `decisoes` | 10 | data |
| Lembretes | `lembretes` | 1 | id |
| Orçamento | `orcamento` | 15 | categoria |

Notion DB IDs (schema file is gitignored — recorded here for recovery):
```
categorias       388481dd-f843-819c-8c39-ead8ecc33e1c
subcategorias    388481dd-f843-810f-aa21-c34a2e2547af
contas           388481dd-f843-81d9-abe1-e6149356186d
meios_pagamento  388481dd-f843-81fc-9455-ca8eeb308f71
recorrentes      388481dd-f843-81b1-be8b-f75eb57480c7
recebiveis       388481dd-f843-81ff-a02f-fb266e1688a5
lancamentos_pf   388481dd-f843-815e-827d-e5fbf303f6ca
lancamentos_pj   388481dd-f843-8102-bb5c-f3de5eb1f5a5
decisoes         388481dd-f843-8164-b615-d49c82177229
lembretes        388481dd-f843-817e-812f-fcae9f753c9f
orcamento        388481dd-f843-8199-8a4e-dec5468c3535
```
Source spreadsheet (frozen): `1xlivzP9po42s2SoIqr45uRFuphHgGdHdpf7X1JRtThg`.

## Result — Naia (6 databases, 44 rows)
| Database | key | rows | match field |
|---|---|---|---|
| Pesagens | `pesagens` | 17 | data |
| Diário | `diario` | 1 | data |
| Monjaro | `monjaro` | 2 | data_aplicacao |
| Exames | `exames` | 19 | exame |
| Eventos clínicos | `eventos_clinicos` | 5 | tema |
| Refeições | `refeicoes` | 0 | data |

`diario` is legitimately 1 (tracker just started); `refeicoes` legitimately empty (tab recently created). `exames` = 19 reference rows (exam name + ref ranges) with empty `data_coleta` — so `--require-field exame` was used.

Notion DB IDs:
```
pesagens         388481dd-f843-813c-957b-c7469549a284
diario           388481dd-f843-8190-a543-cc7c8773b005
monjaro          388481dd-f843-8182-8f21-fa9b97323b15
exames           388481dd-f843-81ff-a043-f6988ce33f7a
eventos_clinicos 388481dd-f843-81ad-a3cb-f47fd9034ede
refeicoes        388481dd-f843-81cb-b352-ee1c087f6502
```
Source spreadsheet (frozen): `1SaFXt8hpuzlJ-S-DuWdiXOpzvF6xq1RjlAfIFKNs2tw`.

## Verification & tests
- **Row counts**: live Notion query counts match source for every table (above).
- **Round-trip tested 2× on each agent**: `create-row → query (found) → archive → query (gone)` with clearly-marked test data (Finance: `test-mig-1/2` on lancamentos_pf; Naia: far-future `2099-01-01/02` on pesagens). Test rows cleaned (archived).

## Agent repoint ("agents using Notion")
Both agents now read/write Notion instead of Sheets/Composio:
- **Finance**: `groups/finance/CLAUDE.local.md` (authoritative top section "Camada de dados = NOTION", auto-loaded), `system-prompt.md` (intents → `notion_db.py` verbs; no active Sheets calls), `container.json` (Composio MCP removed). Stale container killed → next use spawns with the Notion prompt.
- **Naia**: `groups/naia/CLAUDE.local.md`, `system-prompt.md`, `escopo.md`, and the `container/skills/naia-tracker-sheets` skill all repointed to `notion-db`; `container.json` Composio removed (Fireflies kept). Protocols preserved (Leach OCR, end-of-day parsing, photo→plate, post-write alerts, confirmation card).

Note: `groups/*/system-prompt.md`, `escopo.md`, `container.json`, and `migration/schema.*.json` are **gitignored** (install-specific) and live on disk only; the repoint of `CLAUDE.local.md` (tracked) plus this doc are the durable record. The reusable code (`container/skills/notion-db`, `naia-tracker-sheets`) is committed.

## Pending (owner-side, non-blocking)
1. **First real card-confirmed write** is the live end-to-end check (the mandatory confirmation card needs a human; couldn't be automated). Tooling + prompt validated.
2. **Empty the Notion trash** — archived junk databases from backfill iterations sit there.
3. **Watch the next Finance/Naia cron run** (they now operate against Notion).
4. **Retire Sheets** after a confidence window (currently frozen, intact).
5. Pre-existing (unrelated): `finance-rollover` still awaits the owner's ok.

## Rollback
Nothing destructive was done to source data — the spreadsheets are intact and frozen. To revert an agent to Sheets: restore its `system-prompt.md` / `CLAUDE.local.md` / `container.json` from git history (CLAUDE.local.md) or the prior on-disk version, and re-add the Composio MCP. The Notion databases can be archived. `secretMode` can be set back to `selective`.
