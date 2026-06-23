# Design — Migrate Sheets-backed personal agents to a Notion "Base | Pessoal"

**Date:** 2026-06-23
**Status:** Approved (design); pending implementation plan
**Author:** Claude (brainstorm with Jonas)

## 1. Goal

Move the two personal agents that currently persist to Google Sheets — **Finance
(Levis)** and **Naia (nutrition/health)** — onto Notion databases living under the
existing (currently blank) Notion page **"Base | Pessoal"**
(`388481dd-f843-80a1-b09d-ce0d9e67cc3e`). After cutover, Notion is the **single
source of truth**: agents read and write only Notion; Google Sheets is frozen as a
read-only archive (not fed) for a ~2-week safety window, then retired.

Out of scope: the work/agency agents (Zory, Caio) that also touch Sheets — they stay
as-is for now. `treino` does **not** use Sheets (it uses the Hevy MCP) and is untouched.

## 2. Decisions (locked with user)

| Decision | Choice |
|---|---|
| Source of truth after migration | **Notion only**; Sheets frozen, not deleted |
| Historical data | **Migrate all history** via a one-time backfill, with row-count verification |
| Derived/formula tabs (Dashboard, Projeção, deltas, % adesão) | **Agent computes on demand**; store raw data only. Recreate only per-row Notion formulas that depend solely on their own row (e.g. exam `flag`) |
| Notion account | Same workspace as the content base ("Base \| Nanoclaw"); OneCLI Notion OAuth already reaches it |
| Writer mechanism | **Generic schema-driven `notion_db.py` helper** (option A), mirroring the existing native `sheets_api.py` pattern |
| Rollout order | **Finance first, then Naia** — independent tracks |

## 3. Context / prior art

- Both agents already write via the **native** helper `sheets_api.py`
  (`/app/skills/gsheets/scripts/sheets_api.py`, source at
  `container/skills/gsheets/scripts/sheets_api.py`) using Google OAuth injected by the
  OneCLI gateway. **Not** Composio — although Finance's `container.json` still carries a
  stale Composio MCP entry and Naia's `CLAUDE.local.md` text still references Composio
  `googlesheets`. The migration replaces the native Sheets helper with a native Notion
  helper, and removes the stale Composio references.
- The content system already migrated off Sheets to Notion with the same auth pattern:
  `container/skills/read-post/scripts/notion_row.py` POSTs to `https://api.notion.com/v1/pages`
  with **no `Authorization` header** (OneCLI injects the Notion bearer), Notion API
  version `2022-06-28`. Target DB constants are hardcoded. This is the proven template.
- Spreadsheet IDs being migrated:
  - Finance: `1xlivzP9po42s2SoIqr45uRFuphHgGdHdpf7X1JRtThg`
  - Naia: `1SaFXt8hpuzlJ-S-DuWdiXOpzvF6xq1RjlAfIFKNs2tw`
- Existing content base for reference: "Base | Nanoclaw" `386481dd-f843-800b-a775-d273d47e9ea1`,
  containing "Referências — Conteúdo" `386481dd-f843-8146-b285-e3b0d818b842`.

## 4. Architecture

### 4.1 Notion structure

Under **Base | Pessoal** (`388481dd-…`), two sub-pages:

- **💰 Finanças (Levis)** — finance databases
- **🩺 Saúde (Naia)** — health databases

Databases are created via the Notion API at bootstrap; the returned database IDs are
captured into per-agent schema config files (see 4.3). The agents never hand-author
Notion JSON.

### 4.2 The shared foundation — `notion-db` container skill

A new container skill at `container/skills/notion-db/` with:

- **`notion_db.py`** — generic CRUD against `api.notion.com`, **no auth header**
  (OneCLI injects), API version `2022-06-28`. Verbs:
  - `create-row <db-key> --json '{field: value, …}'` → builds the Notion property payload
    from the schema map, POSTs, prints the created page URL + the logical `id`.
  - `query <db-key> [--filter field=value]` → returns rows as flat JSON.
  - `update <db-key> --match id=<val> --json '{…}'` → patch by logical id.
  - `archive <db-key> --match id=<val>` → soft-delete (Notion `archived: true`); this is
    how "undo" works.
  - `resolve` (internal) → name→page-id lookup for relation targets, cached per process.
  - `create-db --parent <page-id> --schema <db-key>` → bootstrap a database from the
    schema definition; prints the new database id (used once at setup).
- **Schema config, one file per agent** (`schema.finance.json`, `schema.naia.json`),
  mapping each logical field → `{ notion_prop, type, relation_db?, options? }` where
  `type ∈ {title, text, number, date, datetime, select, checkbox, relation, created_time, formula}`.
  The helper is dumb; the schema file is the single place that knows the shape. This keeps
  the helper one well-bounded unit reused by both agents.
- **`backfill_sheets.py`** — one-time loader: reads a Sheets tab via `sheets_api.py get`,
  maps each row to a `create-row` call, throttled to respect Notion's ~3 req/s limit,
  deduping by logical `id`. Loads master/reference databases before transactional ones so
  relations resolve.
- **`SKILL.md`** — teaches the verbs, the schema-file contract, the access-check step, and
  how to add a new database.

**Data principle:** only raw data is stored. Derived dashboards/projections are computed
by the agent on read. The only Notion-native formulas are per-row ones depending solely on
their own row (exam `flag`). Cross-row computations (weight deltas between weigh-ins,
adherence %) are **not** Notion formulas — the agent computes them on demand.

### 4.3 Database schemas

#### 💰 Finanças (Levis) — 9 core databases + "Execuções" (cron log)

- **Lançamentos** — title: `descricao`. Props: `id` (text, idempotency key `lan-xxxxxx`),
  `data` (date), `tipo` (select: despesa/receita), `valor` (number), `escopo` (select: PF/PJ),
  `origem` (select), `criado_em` (created_time), `meio_pagamento` (select).
  Relations: → Categorias, → Subcategorias, → Contas (origem), → Contas (destino), → Recorrentes.
  *(PF and PJ merged into one DB distinguished by `escopo`; filter by view.)*
- **Recorrentes** — title: `nome`. Props: `valor`, `frequencia` (select), `status`
  (select: ATIVO/PENDENTE/CORTADO/ENCERRADO), `dia_do_mes`, `termina_em` (date),
  `parcelas_restantes`, `pago_no_mes` (checkbox), `codigo`. Relations: → Categorias, → Subcategorias.
- **Recebíveis** — title: `descricao`. Props: `valor`, `data_prevista` (date), `status`
  (select: esperado/recebido), `recebido_em` (date). Relation: → Contas.
- **Contas** — title: `nome`. Props: `escopo` (select), `saldo_inicial`, `saldo_atual`
  (number, agent-maintained).
- **Categorias** — title: `nome`. Props: `codigo_prefixo`. *(Real DB — metadata used by agent logic.)*
- **Subcategorias** — title: `nome`. Props: `codigo_prefixo`, `nao_sugerir_corte` (checkbox).
  Relation: → Categorias (pai).
- **Orçamento** — title: `rotulo`. Props: `limite` (number). Relations: → Categorias, → Subcategorias.
- **Decisões** — title: `tema`. Props: `tipo` (select), `data`, `motivo_corte`, `impacto_mensal`.
- **Lembretes** — title: `mensagem`. Props: `quando` (datetime), `linhagem` (select).

`MeiosPagamento` → a **select** on Lançamentos (reference list, no extra metadata), not a DB.
`_Log` → a minimal **"Execuções"** DB (cron audit: timestamp, job_name, status, qtd, details) —
kept to preserve the cron observability/idempotency contract.
**Dropped:** Dashboard, Projeção (agent computes).

**Undo semantics:** previously "clear the row range"; now **archive the page** (reversible
soft-delete). The `id` text property is preserved so `editar_lancamento` / `desfazer` still
resolve a target by logical id.

#### 🩺 Saúde (Naia) — 6 databases

- **Pesagens** — title: `data`. Props: 27 Leach-scale numbers (peso, gordura, músculo,
  visceral, água, IMC, TMB + segmental L/R arms & legs), `hora`, `obs`. **No delta columns**
  — agent computes deltas on read.
- **Diário** — title: `data`. Props: meal flags (checkbox sim/não) + components (text) for
  café/almoço/lanche/jantar/ceia, `proteina_total_g`, `agua_ml`, `energetico_latas`,
  `doce_qtd`/`doce_descricao`, `besteira_fora_plano` (checkbox)/`besteira_descricao`,
  `intestino` (select), `sono_h`, `sono_qualidade_1a5`, `sintomas_monjaro`, `hipoglicemia`
  (checkbox)/`hipo_descricao`, `atividade_fisica`, `humor_1a5`, `energia_1a5`, `notas`.
  `adesao_pct` → agent computes (not stored).
- **Monjaro** — title: `data_aplicacao`. Props: `dose_mg`, `local_aplicacao`,
  `efeitos_colaterais`, `tomou_vonal` (checkbox), `intensidade_efeito_1a5`, `obs`.
- **Exames** — title: `exame`. Props: `data_coleta` (date), `resultado` (number), `unidade`,
  `ref_min`, `ref_max`, **`flag` (Notion formula: alto/baixo/normal from same-row props)**,
  `medico_solicitante`, `obs`. *(Only recreated native formula.)*
- **Eventos Clínicos** — title: `tema`. Props: `data`, `profissional` (select), `tipo`
  (select: consulta/ajuste_dose/plano_novo/intercorrencia/decisao/meta_atingida),
  `decisao_acao`, `obs`.
- **Refeições** — title: `data`/refeição. ~10 fields (components, macros). ⚠️ This tab was
  created 2026-06-23 and is **not fully documented** in the prompts. **Confirm the live
  sheet schema before creating this DB.**

`leia_primeiro` → plain text on the Saúde sub-page, not a DB.
**Dropped:** dashboard, visao_equipe (derived).

**Preserved protocols** (only the write target changes): Leach scale OCR → confirm → write
Pesagens; end-of-day natural-language parse → confirm → write Diário; photo→plate →
Refeições + Diário.

## 5. Cutover plan (per track: Finance, then Naia)

1. **Bootstrap** — create the sub-page + databases via API; capture IDs into `schema.<group>.json`.
2. **Backfill** — `backfill_sheets.py` loads master DBs first (Categorias → Subcategorias →
   Contas), then transactional DBs, throttled, deduped by `id`.
3. **Verify** — compare Sheets row counts vs Notion page counts per tab; present the table;
   proceed only on a match.
4. **Swap writes** — update the agent's `system-prompt.md` + skill to call `notion_db.py`
   instead of `sheets_api.py`, preserving the existing intents (field→property mapping, not a
   logic rewrite).
5. **Repoint crons** — finance crons (`finance-sweep/daily/weekly/monthly/rollover/trimestral/
   semestral/anual`) read/write Notion. Test each in isolation. *(Most sensitive step.)*
6. **Live smoke** — exercise each intent for real (registrar despesa → editar → desfazer;
   pesagem; diário) and confirm in Notion.
7. **Decommission Sheets path** — remove the Sheets path from the prompt and the stale Composio
   MCP entry from Finance's `container.json`. **Do not delete the spreadsheet** — freeze it
   read-only for ~2 weeks.
8. **Update docs** — each group's `CLAUDE.local.md` + project memory.

## 6. Risks & mitigations

- **Integration page access** — before any write, the agent `fetch`es "Base | Pessoal". A 404
  means the OneCLI Notion integration isn't shared with the page → prompt the user to click
  "Connect" on the page (one manual step). Not a hard blocker.
- **Notion rate limit (~3 req/s)** — `backfill_sheets.py` throttles.
- **Wide databases** (Pesagens: 27 numbers) — Notion supports it; verify in smoke test.
- **Refeições schema uncertainty** — read the live sheet and confirm with the user before
  creating the DB.
- **Cron repoint** is the riskiest change — each cron tested in isolation before relying on it.

## 7. Reversibility / rollback

Nothing is destructive before step 7, and step 7 only removes **code paths** — no data is
deleted. Because the spreadsheet stays frozen and intact, if Notion fails within the ~2-week
window, writes can be repointed back to Sheets with no data loss. The point of no return only
arrives after the user validates and the spreadsheet is formally retired. The user can halt at
any step.

## 8. Open items to confirm during implementation

- Live `Refeições` (Naia) tab schema.
- Exact current set/order of Finance cron jobs and which intents each fires (verify against the
  live cron registry, not just the prompt text).
- Whether the OneCLI Notion integration is already shared with "Base | Pessoal" (fetch check).
