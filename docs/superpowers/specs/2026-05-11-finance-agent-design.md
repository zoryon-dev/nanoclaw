# Finance Agent — Design Spec

**Date:** 2026-05-11
**Owner:** Jonas
**Status:** Approved (brainstorming)
**Skill:** `add-finance` (feature skill, installable via `/add-finance`)

## Goal

Standalone NanoClaw agent dedicated to personal + business finance management for Jonas (PF + PJ in single Google Sheets workbook). Inputs come via natural language on a dedicated Telegram bot, with confirmation before every write. Outputs are a live Sheets dashboard, scheduled digests (daily/weekly/monthly), one-shot reminders, and on-demand queries.

The agent does not decide *when* anything happens — cron and Sheets formulas are the source of temporal truth. The agent only formats data injected into prompts.

## Scope (MVP)

In:
- Lançamentos (receitas + despesas), PF + PJ
- Recorrentes/fixos (subscriptions, fixed bills, salary)
- Orçamento mensal por categoria with status (OK / 80% / estourou)
- Previsão de fluxo de caixa (next 6 months)
- One-shot reminders (intraday, agendados pelo user)
- Live dashboard tab + scheduled chat digests + on-demand queries

Out (explicitly):
- Bank account tracking / balances per institution
- Credit card statements (fatura) handling
- Investments / brokerage integration
- Multi-currency
- Multi-user (single user: Jonas)

## Architecture

### Components

```
groups/finance/                          # NEW — RW workspace for the agent
├── CLAUDE.md                            # persona + SHEET_ID + operational rules
├── system-prompt.md                     # detailed behavioral instructions
├── categorias.md                        # echo of Categorias tab for reference
└── scratch/                             # ephemeral working notes

.claude/skills/add-finance/              # NEW — installable feature skill (branch skill/add-finance)
├── SKILL.md                             # install playbook for Claude/operator
├── system-prompt.md                     # template copied to groups/finance/
├── claude-md-template.md                # template copied to groups/finance/CLAUDE.md
├── categorias-seed.json                 # 9 PF + 6 PJ default categories
├── cron-jobs.json                       # 5 jobs definition
└── prompts/                             # templates for cron-injected prompts
    ├── daily-digest.md
    ├── weekly-closing.md
    ├── monthly-closing.md
    └── sweep-reminder.md

scripts/finance/                         # NEW — one-time setup + ongoing utilities
├── bootstrap-sheet.ts                   # creates spreadsheet + 9 tabs + formulas + named ranges
├── seed-categorias.ts                   # populates Categorias tab
├── register-cron-jobs.ts                # inserts 5 jobs into task-scheduler
├── postinstall-check.ts                 # Tier 1 validation
├── smoke-test.ts                        # Tier 2 validation (rerunnable)
└── reconcile-recorrentes.ts             # manual reconciliation utility
```

### Data plane: Google Sheets workbook "Finance — Jonas"

Owned by Jonas's Google account (the one connected to Composio for agent `finance`). 9 tabs:

| # | Tab | Type | Purpose |
|---|---|---|---|
| 1 | `Dashboard` | read-only (formulas) | Live KPIs for current month |
| 2 | `Lançamentos-PF` | input | One row per PF entry/exit |
| 3 | `Lançamentos-PJ` | input | One row per PJ entry/exit |
| 4 | `Recorrentes` | config | Subscriptions, fixed bills, salary (escopo column for PF/PJ) |
| 5 | `Orçamento` | config + formulas | Monthly cap per category with status |
| 6 | `Projeção` | read-only (formulas) | 6-month cash flow projection |
| 7 | `Lembretes` | operational queue | One-shot intraday reminders |
| 8 | `Categorias` | taxonomy | Allowed list (escopo + categoria) |
| 9 | `_Log` | system | Cron execution log |

### Channel: Telegram bot dedicated

New Telegram bot (working name `@JonasFinanceBot`, user confirms during install). DM only. Wired to agent group `finance` via `manage-channels`. Telegram chosen over WhatsApp for: better PDF attachments, no risk of message lost in group noise, clean separation from personal life.

### Toolkit: Composio googlesheets

Already in NanoClaw catalog. Added to agent `finance`'s matrix via the standard playbook in `scripts/composio-generate-auth-links.mjs`. Authentication, audit, and provisioning use the existing scripts.

### Cron: `task-scheduler.ts`

5 jobs registered (timezone `America/Sao_Paulo`):

| Job | Schedule | Action |
|---|---|---|
| `finance-sweep` | every hour 08–22h | Read `Lembretes WHERE quando<=NOW() AND enviado_em IS NULL` → send each → mark `enviado_em=NOW()` |
| `finance-daily` | 08:00 daily | Inject today's due + 7d-ahead recorrentes + yesterday's lançamentos into prompt → agent formats Telegram digest |
| `finance-weekly` | Sunday 19:00 | Weekly closing summary |
| `finance-monthly` | last day of month 21:00 | Monthly closing summary |
| `finance-rollover` | day 1 of month 00:30 | Reset all `Recorrentes.pago_no_mes=FALSE`; materialize the month's recorrentes into `Lembretes` (one row per upcoming due) |

## Tab schemas

### `Lançamentos-PF` and `Lançamentos-PJ` (identical schema)

| col | type | example | notes |
|---|---|---|---|
| `id` | string | `lan-a8f3c2` | Generated by agent for idempotency |
| `data` | date | 2026-05-11 | Effective date (not creation) |
| `tipo` | enum | `despesa` / `receita` | Dropdown validation |
| `valor` | number | 80,00 | Always positive, BRL formatted |
| `categoria` | string | `Transporte` | Validated against `Categorias` for the relevant escopo |
| `descricao` | string | "Uber pra reunião" | Free text |
| `origem` | enum | `chat` / `recorrente` / `manual` | Provenance |
| `recorrente_id` | string | `rec-aluguel` | Only when `origem=recorrente` |
| `criado_em` | timestamp | 2026-05-11T09:14 | Auto |

### `Recorrentes`

| col | type | example | notes |
|---|---|---|---|
| `id` | string | `rec-aluguel` | |
| `escopo` | enum | `PF` / `PJ` | |
| `nome` | string | "Aluguel apto" | |
| `tipo` | enum | `despesa` / `receita` | |
| `valor` | number | 2500 | |
| `categoria` | string | `Moradia` | |
| `frequencia` | enum | `mensal` / `semanal` / `anual` | |
| `dia_do_mes` | int | 5 | Day of month for `mensal` |
| `proxima_data` | formula | `=DATE(...)` | Computes next due date |
| `pago_no_mes` | bool | TRUE/FALSE | Reset by `finance-rollover` |
| `ativo` | bool | TRUE | Soft-delete flag |

### `Orçamento`

| col | example | notes |
|---|---|---|
| `escopo` | `PF` | |
| `categoria` | `Alimentação` | |
| `teto_mensal` | 1500 | User-set |
| `gasto_no_mes` | `=SUMIFS(...)` | Formula over `Lançamentos-{escopo}` filtered by current month + categoria |
| `pct_usado` | `=gasto_no_mes/teto_mensal` | Percentage |
| `status` | `=IF(pct>1,"❌ estourou",IF(pct>0.8,"⚠️ 80%","OK"))` | Conditional formatting (red/yellow/green) |

### `Projeção` (pivot: rows = next 6 months)

| col | content |
|---|---|
| `mes` | "2026-05", "2026-06", ... |
| `receitas_recorrentes` | SUMIFS Recorrentes WHERE tipo=receita AND active |
| `despesas_recorrentes` | SUMIFS Recorrentes WHERE tipo=despesa AND active |
| `saldo_mes` | receitas − despesas |
| `saldo_acumulado` | running sum starting from named range `SALDO_INICIAL` |

`SALDO_INICIAL` is a named cell at the top — user sets once.

### `Lembretes`

| col | example |
|---|---|
| `id` | `lem-x7d2` |
| `quando` | `2026-05-12 14:00` (absolute timestamp) |
| `mensagem` | "pagar IPTU" |
| `linhagem` | `recorrente:aluguel` or `manual:user` |
| `enviado_em` | empty until `finance-sweep` fires |

### `Categorias` (seed values)

| escopo | categoria | ativo |
|---|---|---|
| PF | Alimentação | TRUE |
| PF | Transporte | TRUE |
| PF | Moradia | TRUE |
| PF | Saúde | TRUE |
| PF | Lazer | TRUE |
| PF | Educação | TRUE |
| PF | Assinaturas | TRUE |
| PF | Impostos | TRUE |
| PF | Outros | TRUE |
| PJ | Pró-labore | TRUE |
| PJ | Fornecedores | TRUE |
| PJ | Infraestrutura | TRUE |
| PJ | Marketing | TRUE |
| PJ | Impostos | TRUE |
| PJ | Outros | TRUE |

User edits in-place after install.

### `Dashboard` (formula-driven blocks)

- Header: current month (`=TEXT(TODAY(),"mmmm/yyyy")`)
- KPIs PF: receita do mês, despesa do mês, saldo, % do orçamento total usado
- KPIs PJ: same set
- Top 5 categorias PF and PJ (gasto)
- Next 5 contas a vencer from `Recorrentes` (sorted by `proxima_data`)
- Lembretes pendentes nas próximas 48h
- Projeção: saldo at +3m and +6m

### `_Log`

| col | content |
|---|---|
| `timestamp` | When the cron ran |
| `job` | `finance-daily`, etc |
| `status` | `success` / `error` |
| `qtd_processada` | E.g. number of reminders sent |
| `detalhes` | Free text for errors |

## Input flow (chat → row)

Every write is preceded by a confirmation card with inline buttons (Telegram).

```
1. User: "gastei 80 no uber ontem indo pra reunião"
2. Agent parses:
   { intent: "registrar_despesa", escopo: "PF" (default),
     valor: 80, data: 2026-05-10, categoria: "Transporte",
     descricao: "uber pra reunião" }
3. Agent sends confirmation card:
     "📝 Confirma?
      💸 Despesa PF — R$ 80,00
      📅 10/05 (ontem)
      🏷️ Transporte
      📝 uber pra reunião
      [✓ Sim]  [✏️ Editar]  [❌ Cancelar]"
4a. ✓  → write row → "✅ Lançado (id lan-a8f3c2)"
4b. ✏️ → "o que muda?" → iterate
4c. ❌ → "Ok, descartado"
```

### Recognized intents

| Intent | Example | Action |
|---|---|---|
| `registrar_despesa` | "gastei 50 no mercado" | Confirm → row in `Lançamentos-{escopo}` |
| `registrar_receita` | "recebi 5k do cliente Y" | Confirm → row |
| `cadastrar_recorrente` | "todo dia 5 sai 2500 de aluguel" | Confirm → row in `Recorrentes` |
| `marcar_pago` | "paguei o aluguel" | Set `Recorrentes.pago_no_mes=TRUE` + create `Lançamento` + delete that recorrente's future reminders within current month |
| `agendar_lembrete` | "me lembra dia 25 14h de pagar IPTU" | Row in `Lembretes` |
| `consulta` | "quanto gastei em lazer esse mês?" | Read sheet, respond, no write |
| `definir_orcamento` | "limite alimentação 1500" | Confirm → upsert in `Orçamento` |
| `editar_lancamento` | "muda o último uber pra 90" | Confirm → update by id |
| `desfazer` | "desfaz" | Delete last row written in this session |

### Ambiguity resolution rules

- **Escopo ausente:** ask once per session, remember in-session default. Never persist cross-session.
- **Categoria with low confidence:** show top 2 + "outra".
- **Vague value** ("uns 50 e pouco"): ask exact.
- **Vague date** ("semana passada"): ask exact day.

### Idempotency

Each row's `id` is a UUID generated by the agent. Before insert, the agent checks if id exists. Same confirmation submitted 2× (network glitch, double-tap) does not duplicate.

## Reliability strategy (the "Zory forgets" problem)

The architectural rule: **the agent never decides *when* something happens. Cron decides; the Sheet is the temporal source of truth.**

Concretely:
- LLMs have no internal clock between invocations and cannot reliably wake themselves up. Anything time-bound must be a row in `Lembretes` (one-shot) or `Recorrentes` (cyclic) and a cron must be the trigger.
- When a user requests "remind me at 14h tomorrow", the agent does **not** say "ok, I'll remember" — it inserts a row in `Lembretes` with absolute timestamp and confirms "✅ Agendado pra 12/05 14:00".
- Cron job prompts are deterministic: the scheduler reads fresh data from the Sheet and injects it into the prompt. The agent receives e.g. *"Today 11/05. Due: aluguel R$2500 dia 15, internet R$120 dia 18. Send a Telegram digest to Jonas."* The agent only formats — it cannot forget what it never had to remember.
- After "paguei o X", the agent must delete future reminders for that recorrente in the current month. Otherwise sweep keeps firing post-payment.

## Setup playbook (`/add-finance`)

| # | Step | Actor | Reversible? |
|---|---|---|---|
| 1 | Create agent group `finance` in DB | skill | yes (delete row) |
| 2 | Create `groups/finance/` + copy templates | skill | yes |
| 3 | Create dedicated Telegram bot via BotFather | user (manual) | n/a |
| 4 | Wire bot → agent group `finance` via `manage-channels` | skill | yes |
| 5 | Add `googlesheets` to `finance`'s row in `composio-generate-auth-links.mjs` | edit script | yes |
| 6 | User authenticates Google → audit → provision-sessions | existing scripts | yes |
| 7 | `bootstrap-sheet.ts` → create spreadsheet, save `SHEET_ID` to `groups/finance/CLAUDE.md` | new script | yes (delete sheet) |
| 8 | `seed-categorias.ts` → populate Categorias | new script | yes |
| 9 | `register-cron-jobs.ts` → insert 5 jobs in `task-scheduler` DB | new script | yes |

Each step logs `✅ done` or `❌ erro: <reason + how to fix>`. Failures don't roll back prior steps — operator reruns only what failed.

### `bootstrap-sheet.ts` details

Uses Composio `googlesheets`:
1. `CREATE_SPREADSHEET` title="Finance — Jonas", locale `pt-BR`, timezone `America/Sao_Paulo`
2. For each of 9 tabs: `ADD_SHEET` + `BATCH_UPDATE` (headers, formulas, BRL number format, conditional formatting, named ranges including `SALDO_INICIAL`)
3. Apply data validation: `Lançamentos.tipo` → dropdown; `Lançamentos.categoria` → range from `Categorias`; `Recorrentes.frequencia` → dropdown
4. Apply conditional formatting on `Orçamento.status` (green/yellow/red)
5. Return `SHEET_ID` → script writes it into `groups/finance/CLAUDE.md`

### `register-cron-jobs.ts` payload shape

```jsonc
{
  "id": "finance-daily",
  "agent_group": "finance",
  "schedule": "0 8 * * *",
  "timezone": "America/Sao_Paulo",
  "prompt_template": "prompts/daily-digest.md",
  "data_source": "sheet:Recorrentes,Lançamentos-PF,Lançamentos-PJ"
}
```

Scheduler resolves `data_source` (reads fresh data from the Sheet via Composio) BEFORE invoking the agent. Agent prompt arrives pre-populated.

## Testing strategy

### Tier 1 — Postinstall validation (auto, runs end of `/add-finance`)

`scripts/finance/postinstall-check.ts`:

| Check | How | Fails as |
|---|---|---|
| 9 tabs exist with expected names | `GET_SPREADSHEET` | erro 1 |
| Tab headers match schema | `READ_RANGE` row 1 of each tab | erro 2 |
| Named range `SALDO_INICIAL` exists | `GET_NAMED_RANGES` | erro 3 |
| Validation rules on `Lançamentos.tipo` and `.categoria` applied | `GET_DATA_VALIDATION` | erro 4 |
| Categorias seed = 15 rows (9 PF + 6 PJ) | `READ_RANGE Categorias!A:A` | erro 5 |
| 5 cron jobs present in `scheduled_tasks` table | SQL query | erro 6 |
| Telegram bot responds to `/start` | request via Telegram API | erro 7 |
| Composio googlesheets returns 200 on simple `READ_RANGE` | tool call | erro 8 |

### Tier 2 — Smoke test (rerunnable any time)

`scripts/finance/smoke-test.ts`. Three write→read→delete cycles, all marked with `_TEST_` description prefix:

1. **Lançamento:** insert fake PF expense → read back → delete row. Confirms I/O roundtrip.
2. **Recorrente:** insert recorrente with `proxima_data=NOW+3d` → run mock of `finance-daily` → assert digest contains the item → delete.
3. **Lembrete:** insert lembrete with `quando=NOW-1min` → run `finance-sweep` manually → assert `enviado_em` populated AND Telegram message received → delete.

Runs in ~30s. Expected use: after touching the skill, after rotating Composio credentials.

### Tier 3 — Happy path manual (one-time, ~10min)

Script for the user to run as themselves on Telegram:

1. "gastei 30 no café" → confirm → row in `Lançamentos-PF`
2. "todo dia 5 sai 100 do Spotify" → confirm → row in `Recorrentes` with correct `proxima_data`
3. "me lembra em 2 min de testar" → confirm → wait → message arrives
4. "quanto gastei hoje?" → correct response with no write
5. "paguei o Spotify" → `pago_no_mes=TRUE` + Lançamento created + future reminders cleared
6. "desfaz" → last written row gone
7. Set `SALDO_INICIAL=10000` manually → open Projeção → 6 months populated correctly
8. Edit a lançamento manually in the sheet → next agent query reflects new value (no cache)

Pass criterion: 8/8.

### Tier 4 — Soak (1 week of real use, observation only)

Health metrics from `_Log` and Sheet:
- Daily digest arrives at 08h ±5min every day (cron + scheduler healthy)
- `_Log` has zero `status=error` entries
- Zero rows with duplicate `id` (idempotency works)
- Zero `Lembretes` rows where `quando < NOW()-1h AND enviado_em IS NULL` (sweep not lagging)

Failure on any → root-cause from `_Log` and fix.

## Defaults (locked)

| | Value |
|---|---|
| Telegram bot | `@JonasFinanceBot` (working name; final confirmed during install) |
| Cron timezone | `America/Sao_Paulo` |
| Sweep cadence | hourly, 08h–22h inclusive (15 fires/day) |
| Sheet locale | `pt-BR` (decimal vírgula, R$, dd/mm/yyyy) |

## Open questions to revisit post-MVP

These are explicitly **out of scope** for the first build but flagged for future iterations:

- Bank account / cartão tracking (user excluded from MVP)
- Investments and brokerage integration
- PDF/image attachment ingestion (NF, boleto, comprovante PIX) — leverages existing `add-pdf-reader` and `add-image-vision` skills
- Pluggy / Belvo Open Finance integration for auto-import
- Sharing PJ sheet with accountant (read-only filtered view)
- Multi-user (only Jonas for now)

## Out-of-scope clarification

This is **not**:
- A FinTech development reference (use Stripe/Plaid official docs)
- A trading or investment advisor
- A multi-tenant or multi-currency system
- A replacement for accounting software for tax filing
