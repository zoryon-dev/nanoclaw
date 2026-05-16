# Levis — CSV bank statement import (parse + reconcile + add)

**Date:** 2026-05-16
**Status:** Design — ready for implementation plan
**Agent affected:** `groups/finance` (Levis), `.claude/skills/add-finance`, new `container/skills/finance-csv`

## Problem

Levis today only writes line-by-line through chat (confirmation card per item). Importing 30–80 lines from a bank statement that way is unusable. The user wants to forward a statement file as a Telegram attachment and have Levis:

1. **Reconcile** the CSV against current sheet state (existing `Lançamentos`, active `Recorrentes`, pending `Recebíveis`) so nothing duplicates.
2. **Add** the remainder as new `Lançamentos`, with categoria/subcategoria pre-classified, in a single batch confirmation.

The chat and statement flows must coexist (hybrid use case). Idempotency across re-imports is non-negotiable — finance is the wrong domain for "sometimes duplicates".

**Real source formats** (verified against actual exports in `/root/nanoclaw/extratos/`, never committed):

| Source | File format | Notes |
|---|---|---|
| BTG PF | `.xls` (OLE2 binary, Excel 97-2003) | Only export option for individual accounts |
| BTG PJ | `.csv` (`,` quoted, header `"Data","Descricao","Valor","Saldo"`) | Different export channel than PF |
| Inter PF | `.csv` (`;`, with preamble rows: "Extrato Conta Corrente", "Conta;…", "Período;…" before the real header) | Real header on row 4 or 5 |
| Hotmart | `.csv` (`;`, UTF-8 with BOM, header `Data do lançamento;Data da efetivação;Status;Transação;...;Categoria`) | **Has its own `Categoria` column** — usable as classification hint |

Four parsers, two formats (XLS + CSV). The container skill installs the `xlsx` npm package to read BTG PF.

## High-level approach

A new container skill, `finance-csv`, exposes a CLI binary the agent invokes via `Bash`. The binary handles the deterministic parts (parsing, matching, classification lookup); the agent handles the parts requiring judgment (classify ambiguous items, render the summary card, gate the write). Composio googlesheets stays the only tool that writes to the sheet, called by the agent after user confirmation.

```
Telegram CSV attachment
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ Levis agent (intent: processar_extrato)                      │
│                                                              │
│  1. Bash: finance-csv parse <file>       → canonical.json    │
│  2. Composio: BATCH_GET (3 tabs)         → sheet-dump.json   │
│  3. Bash: finance-csv reconcile          → result.json       │
│     (also reads classification-cache.json)                   │
│  4. Classify remaining ambiguous via IA + doc canônico       │
│  5. Render summary card → user                               │
│  6. Process edits (loop)                                     │
│  7. On confirm:                                              │
│     - Composio: UPDATE_VALUES_BATCH (Lançamentos)            │
│     - Composio: update Recorrentes.pago_no_mes (batch)       │
│     - Composio: update Recebiveis.status (batch)             │
│     - Write: classification-cache.json (upsert)              │
│     - Move CSV → imports/processed/                          │
└──────────────────────────────────────────────────────────────┘
```

## Components

### New: `container/skills/finance-csv/`

```
container/skills/finance-csv/
├── SKILL.md                         allowed-tools: Bash(finance-csv:*)
├── finance-csv                      shell wrapper (-> /usr/local/bin/)
├── package.json                     declares xlsx dep (BTG PF needs it)
├── lib/
│   ├── cli.mjs                      subcommand router (parse | classify | reconcile)
│   ├── fuzzy.mjs                    token-set Jaccard helper
│   ├── normalize.mjs                descricao normalization for cache keys
│   ├── parsers/
│   │   ├── detect.mjs               format + bank auto-detection (.xls + .csv headers)
│   │   ├── btg_pf.mjs               BTG PF — XLS via xlsx package
│   │   ├── btg_pj.mjs               BTG PJ — CSV `,` quoted + Saldo column
│   │   ├── inter.mjs                Inter PF — CSV `;` with preamble rows
│   │   └── hotmart.mjs              Hotmart — CSV `;` UTF-8 BOM + Categoria column
│   ├── classify.mjs                 cache lookup with normalization
│   └── reconcile.mjs                deterministic match against sheet dump
└── __tests__/
    ├── fuzzy.test.mjs
    ├── normalize.test.mjs
    ├── parsers.test.mjs             per-bank snapshot tests
    ├── reconcile.test.mjs           per-bucket assertions
    ├── classify.test.mjs            cache hit/miss tests
    └── fixtures/
        ├── btg-pf-sample.xls        anonymized real export
        ├── btg-pj-sample.csv
        ├── inter-pf-sample.csv
        └── hotmart-sample.csv
```

The skill follows the `pdf-reader` precedent (`container/skills/pdf-reader/`) — declared `allowed-tools: Bash(finance-csv:*)`, called by the agent via `Bash`. The Dockerfile copies the whole `lib/` dir to `/usr/local/lib/finance-csv/` and the shell wrapper to `/usr/local/bin/finance-csv` (since the CLI now has multiple modules + an npm dep, not a single bash script like `pdf-reader`). The `xlsx` package is `npm install`ed during container build.

### Modified: `groups/finance/`

```
groups/finance/
├── classification-cache.json        NEW — pattern → {cat, subcat}
└── imports/                         NEW — audit trail
    ├── inbox/                       freshly received CSVs, not yet processed
    ├── processed/                   successfully imported (filename + .summary.json)
    └── cancelled/                   user cancelled at confirmation
```

The Telegram attachment handler must save uploaded statement files (mime `text/csv`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, OR extensions `.csv`/`.xls`/`.xlsx`) to `groups/<group>/imports/inbox/`. This is a small extension to the existing attachment handler — the image handler already saves to a per-group path; this mirrors that.

### Modified: `.claude/skills/add-finance/system-prompt.md`

Add `processar_extrato` to the intents table and a new workflow section detailing the 7 steps above. Also:

- Add row to "Tools que você usa" mentioning `Bash(finance-csv:*)`
- Add row to "Resolução de ambiguidades" for ambiguous matched lines (multiple sheet rows match)
- Add row to "Limites" clarifying the CSV flow never auto-writes (always card-gated)

### Modified: `.claude/skills/add-finance/SKILL.md`

Bump bootstrap to include `container/skills/finance-csv` install step and seed an initial `classification-cache.json` with common patterns (TARIFA, IOF, ANUIDADE → Tarifas Bancárias).

## Canonical schema (parse output)

```json
{
  "banco": "btg_pf" | "btg_pj" | "inter" | "hotmart",
  "conta_inferida": "BTG D" | "BTG PJ" | "Inter PF" | "Hotmart",
  "escopo": "PF" | "PJ",
  "periodo": { "inicio": "2026-05-01", "fim": "2026-05-31" },
  "linhas": [
    {
      "linha_id": "btg_pf-2026-05-03-001",
      "data": "2026-05-03",
      "valor": 80.00,
      "tipo": "despesa" | "receita" | "estorno" | "transferencia_interna",
      "descricao_raw": "UBER *TRIP 3829",
      "banco_tx_id": "HP3885105953" | null,
      "meio_pagamento_hint": "PIX" | "Cartão C1" | "Boleto" | "Transferência" | null,
      "categoria_hint": "Antecipação" | null
    }
  ]
}
```

`linha_id` is deterministic (`{banco}-{data}-{seq}`) — re-parsing the same source produces identical IDs, enabling the `skipped_reimport` bucket. When the source provides a stable `banco_tx_id` (Hotmart's `Transação` column, BTG PF's row id), it becomes the secondary match key.

`categoria_hint` is set when the source itself classifies the line (currently only Hotmart, via its `Categoria` column — e.g. "Antecipação", "Comissão", "Reembolso"). The classify step uses it as a first-pass suggestion (mapped through a small lookup table) before falling back to cache lookup. Other parsers always set `null`.

### Per-bank quirks the parsers absorb

| | BTG PF | BTG PJ | Inter PF | Hotmart |
|---|---|---|---|---|
| File format | `.xls` (OLE2 binary) | `.csv` | `.csv` | `.csv` |
| Encoding | n/a (binary) | UTF-8 | UTF-8 or Latin-1 | UTF-8 with BOM |
| Separator | n/a | `,` (with `"` quoting) | `;` | `;` |
| Preamble rows | header on row N (varies) | none | 3-4 metadata rows before header | none (BOM only) |
| Sign convention | column dependent on export template | sign on `Valor` (`-1.700,00`) | sign on `Valor` | sign on `Valor` |
| Date format | `dd/mm/yyyy` (cell) | `dd/mm/yyyy` | `dd/mm/yyyy` | `dd/mm/yyyy` |
| Stable tx_id | row index (synthetic) | none | none | `Transação` column |
| Own category | none | none | none | **yes** (`Categoria` column → `categoria_hint`) |
| meio_pagamento_hint | from descricao keywords | from descricao keywords | from descricao keywords | always null |

Auto-detection runs in two stages:

1. **Format detection** by file extension + magic bytes: `.xls` (`D0CF 11E0` = OLE2) → BTG PF; `.csv` (text) → bank detection by content
2. **Bank detection** for CSVs by matching first non-empty data row against known signatures (Hotmart's `Data do lançamento;...;Categoria`, BTG PJ's `"Data","Descricao","Valor","Saldo"`, Inter PF's preamble keyword `Extrato Conta Corrente`)

On no match, the binary exits non-zero with `unknown source — head: <first 200 chars>`. Manual override: `finance-csv parse <file> --bank btg_pf|btg_pj|inter|hotmart`.

## Reconciliation algorithm

`finance-csv reconcile --csv canonical.json --sheet dump.json --cache cache.json --markers imports/processed/ --out result.json`

Each `linha` runs through 7 checks in order; first hit wins. Steps 5 and 6 only apply to lines flagged as `estorno` or `transferencia_interna` by the parser, but are ordered after the standard buckets to catch the rare case where a transfer happens to match an existing lançamento (the earlier bucket wins, which is correct — explicit user entry > heuristic).

```
For each linha in canonical.linhas:

  1. ALREADY IMPORTED?
     if linha.linha_id ∈ union of all markers in imports/processed/*.summary.json
       → bucket: skipped_reimport
       (silent — only counted in summary)

  2. MATCHES ACTIVE RECORRENTE?
     if linha.tipo='despesa' AND ∃ rec in recorrentes_ativos where:
        |rec.valor - linha.valor| ≤ R$ 0,50
        AND |rec.dia_do_mes - linha.data.dia| ≤ 3
        AND rec.pago_no_mes == FALSE
        AND fuzzy_match(linha.descricao_raw, rec.nome) > 0.6
            (fuzzy_match = token-set ratio: lowercase, split on whitespace/punctuation,
             compute Jaccard similarity of token sets. 0.6 means majority of tokens
             overlap. Library choice: implement inline — ~15 lines — to avoid
             dependency on fuzzy-matching package.)
     → bucket: candidato_recorrente
       { linha, recorrente_id, recorrente_codigo, recorrente_nome, conf }

  3. MATCHES PENDING RECEBIVEL?
     if linha.tipo='receita' AND ∃ rec in recebiveis_esperados where:
        |rec.valor - linha.valor| ≤ R$ 0,50
        AND |rec.data_prevista - linha.data| ≤ 5 days
     → bucket: candidato_recebivel
       { linha, recebivel_id, recebivel_descricao }

  4. ALREADY IN LANÇAMENTOS (chat or prior import)?
     if ∃ lan in lancamentos where:
        lan.valor == linha.valor (exact)
        AND |lan.data - linha.data| ≤ 1 day
        AND lan.tipo == linha.tipo
     → if exactly 1 match: bucket "matched"
     → if multiple matches: bucket "ambiguous"
       { linha, candidatos: [lan_id, ...] }

  5. ESTORNO?
     if linha.tipo == 'estorno':
       search lancamentos for negative-of-this:
         lan.tipo == 'despesa', |lan.valor - linha.valor| < 0.01,
         |lan.data - linha.data| ≤ 7 days, descricao similar
       → bucket "estorno_match" if found, else "to_add" as receita with descricao "ESTORNO: ..."

  6. TRANSFERENCIA_INTERNA?
     if linha.tipo == 'transferencia_interna':
       → bucket "transferencia_interna" (silent — saldos recalc via fórmula in Contas)

  7. REMAINDER
     → bucket "to_add"
       attach classify(linha.descricao_raw, cache) → { categoria, subcategoria, fonte }
```

### Result structure

```json
{
  "summary": {
    "total_linhas": 47,
    "matched": 12,
    "candidato_recorrente": 3,
    "candidato_recebivel": 1,
    "estorno_match": 0,
    "transferencia_interna": 1,
    "to_add": 29,
    "skipped_reimport": 0,
    "ambiguous": 1
  },
  "matched":              [{ linha, lan_id, confidence }, ...],
  "candidato_recorrente": [{ linha, recorrente_id, recorrente_codigo, recorrente_nome, action: "marcar_pago" }, ...],
  "candidato_recebivel":  [{ linha, recebivel_id, recebivel_descricao, action: "confirmar_recebimento" }, ...],
  "estorno_match":        [{ linha, lan_id_to_delete }, ...],
  "transferencia_interna":[{ linha }, ...],
  "to_add":               [{ linha, sugestao: { categoria, subcategoria, fonte: "cache"|"ia"|null, confidence } }, ...],
  "ambiguous":            [{ linha, candidatos: [...] }, ...]
}
```

### Tolerâncias — rationale

- **R$ 0,50** on recurring: real variation on USD/BRL subscriptions with FX
- **±3 dias** on `recorrente.dia_do_mes`: clearing + business days
- **±1 dia** on Lançamentos: D+0 vs D+1 between chat entry and clearing
- **±5 dias** on Recebíveis: forecast rarely exact
- **Valor exato** on Lançamentos match: cent variation means it's a different transaction

## Classification cache

### File: `groups/finance/classification-cache.json`

```json
{
  "version": 1,
  "patterns": [
    {
      "match": "uber trip",
      "categoria": "Pessoal",
      "subcategoria": "Transporte",
      "meio_pagamento_hint": "Cartão C1",
      "hit_count": 23,
      "last_seen": "2026-05-08"
    }
  ]
}
```

### Growth

After every successful import (user confirmed), `classify.ts` upserts every classified line:
- Compute normalized match key: lowercase `descricao_raw`, strip digits, strip `*XXXX` patterns, collapse whitespace, take the most stable token sequence
- If key exists with same categoria/subcategoria: increment `hit_count`, update `last_seen`
- If key exists with different classification: replace, increment counter — agent surfaces a warning in the next card ("Esse padrão era classificado como X, mudei pra Y. OK?")
- If key absent: insert new pattern

### Lookup ordering (in `classify.mjs`)

1. **Source-provided `categoria_hint`** (currently Hotmart only) → mapped via `hotmart-categoria-map.json` to `{categoria, subcategoria}` in the agent's taxonomy → confidence 0.90, fonte `'source'`. Initial seed mappings:
   - `Antecipação` → `Empresarial / Tarifas Bancárias`
   - `Comissão` → `Empresarial / Tarifas Bancárias`
   - `Reembolso` → `Empresarial / Tarifas Bancárias`
   - Sales/produto-type categories → mapped by operator (extend the file)
2. **Exact normalized match** of `descricao_raw` against cache → confidence 0.95
3. **Substring match** (descricao_raw contains any `patterns[].match`) → confidence 0.80
4. **No match** → return `null`; agent classifies via IA + reads doc canônico's "regras de classificação" → confidence 0.60

The Hotmart hint table lives in `groups/finance/hotmart-categoria-map.json`. Initially seeded by the skill installer with the fee mappings above; the operator extends it for product-specific categories.

### Seed

The skill installer seeds initial patterns for bank fees:

```json
[
  { "match": "tarifa", "categoria": "Empresarial", "subcategoria": "Tarifas Bancárias" },
  { "match": "iof", "categoria": "Empresarial", "subcategoria": "Tarifas Bancárias" },
  { "match": "anuidade", "categoria": "Pessoal", "subcategoria": "Tarifas Bancárias" },
  { "match": "juros", "categoria": "Empresarial", "subcategoria": "Tarifas Bancárias" }
]
```

(If `Tarifas Bancárias` subcategoria doesn't exist in the sheet, the bootstrap migration in the skill installer adds it.)

## Summary card — Telegram UX

For a typical ~40-line CSV:

```
📥 Extrato BTG — mai/2026
47 linhas analisadas

✅ Já gravados (12) — pulei
🔁 Recorrentes (3) — vou marcar como pago:
   1. Netflix R$ 55,90 (dia 3)
   2. Spotify R$ 34,90 (dia 8)
   3. Plano Saúde R$ 1.230 (dia 10)

💰 Recebíveis (1) — vou confirmar:
   4. Hotmart R$ 2.300 (esperado 05/05, caiu 06/05)

🆕 Novos lançamentos (29):

   📁 Pessoal / Alimentação (8 itens, R$ 642)
      5. iFood R$ 48          06/05  cache
      6. iFood R$ 31          08/05  cache
      ... (+6)

   📁 Pessoal / Transporte (5 itens, R$ 187)
      13. Uber R$ 22          06/05  cache
      ...

   📁 Pessoal / Saúde (2 itens, R$ 340)
      18. Drogasil R$ 89      04/05  ia
      19. Clínica X R$ 251    11/05  ia ⚠️

   📁 ??? / ??? (2 itens, R$ 95) — não classifiquei
      20. PAG*SP R$ 35        02/05  ❌
      21. EBN COMPRA R$ 60    09/05  ❌

⚠️ 1 ambíguo:
   22. R$ 45,00 em 07/05 — bate com 2 lançamentos no chat. Qual?

Total novo a gravar: R$ 1.847
Conta: BTG D | Meio inferido por linha

[✓ Confirmar tudo]  [✏️ Editar linha N]  [❌ Cancelar]
```

### Marker legend

- `cache` — classified from cache (high confidence)
- `ia` — classified by IA this turn (medium confidence, italicized)
- `ia ⚠️` — IA classified into sensitive subcategoria (Saúde/Educação/Dívidas) — flag for review
- `❌` — unclassified; needs user input

### Edit grammar

- `edita 20 → Pessoal/Lazer` — change cat/subcat on line 20
- `edita 18 19 → conta Inter` — batch field change
- `pula 21` — remove line from batch
- `confirma` / `sim` / `ok` — commit all
- `cancela` — abort, no writes

After any edit, the agent re-renders the card (no writes). Confirmation triggers the batch write phase.

## Write phase

On confirm, the agent executes in this order (sequential, each blocks the next):

1. **Lançamentos** — one `UPDATE_VALUES_BATCH` per escopo tab (`Lançamentos-PF` and/or `Lançamentos-PJ`). Each row has the 13-column layout from `system-prompt.md` (Plan 3 schema), including the `recorrente_id` column populated for lines that came from `candidato_recorrente`. Soft cap of 100 lines per batch is a design choice (Sheets API allows more), so the agent can render a progress message and so a partial failure surface is bounded. CSVs with >100 new lines split into multiple sequential batches.
2. **Recorrentes** — one batch `UPDATE_VALUES_BATCH` setting `pago_no_mes=TRUE` for each matched recurring item.
3. **Recebíveis** — one batch setting `status='recebido'` + `recebido_em=<linha.data>` for each matched receivable.
4. **Estorno cleanup** — for each `estorno_match`, `CLEAR_VALUES` on the original lançamento row.
5. **Cache update** — `Write` `classification-cache.json` with upserted patterns.
6. **Move CSV** — `mv imports/inbox/<file>.csv imports/processed/<file>.csv` + write `imports/processed/<file>.summary.json` containing the result (for audit and re-import detection).

Idempotency: each `Lançamento.id` is unique (`lan-XXXXXX`), so a partial write + retry will fail-but-skip on duplicates rather than re-create.

## Edge cases

| Case | Handling |
|---|---|
| **Estorno** (negative line cancelling a prior purchase) | Parser flags `tipo='estorno'`. Reconcile searches for the original; on match → `estorno_match` bucket → agent suggests deleting original. No match → falls into `to_add` as receita with descricao `ESTORNO: ...` |
| **Transferência interna** (TED between user's own accounts) | Parser keyword-detects (`TED PROPRIA`, `TRANSF P/`, round PIX value). Marked `tipo='transferencia_interna'`. No lançamento created — saldos recalculate via existing formulas in `Contas` |
| **Bank fee** (IOF, anuidade, tarifa) | Seeded cache patterns → automatic classification into Tarifas Bancárias |
| **Line matches lançamento that already has `recorrente_id`** | Normal `matched` bucket — reconciled in a previous import, no action |
| **Same CSV re-imported same day** | Filename hash marker in `imports/processed/` → reconcile exits with `{error: "already_imported", processed_at: "..."}`. Agent surfaces, offers `--force` flag |
| **CSV period overlaps prior import** | Deterministic `linha_id` puts overlapping lines into `skipped_reimport`. New lines in overlap (rare bank-retroactive) enter normally |
| **Empty CSV** | `linhas: []` → agent: "Esse extrato não tem nenhuma linha. Confere se exportou o período certo?" |
| **Unknown source** | Parser exits non-zero (code 2) with header dump. Agent offers fallback: "Quer que eu trate como BTG PJ (CSV genérico vírgula+quoted)?" |
| **XLS row without recognized header** | BTG PF parser scans first 10 rows for a row matching the expected column names (date + descricao + valor); errors if none found |

## Error handling

| Failure | Response |
|---|---|
| `finance-csv parse` exit ≠ 0 | Agent reads stderr → `❌ Não consegui ler o CSV: <erro>`. CSV stays in `inbox/`. No sheet write. No `_Log` entry (not a cron) |
| Composio `BATCH_GET` fails | One retry. On second failure: `⚠️ Sheets indisponível agora, tenta de novo daqui a pouco`. CSV untouched |
| `finance-csv reconcile` exit ≠ 0 | Same as parse — report stderr, no state change |
| Cache file corrupted (invalid JSON) | `classify.ts` backs up to `classification-cache.json.broken-<ts>`, starts empty cache. Agent warns in card: `⚠️ Cache foi resetado, classificações vão ser tudo via IA neste import` |
| `UPDATE_VALUES_BATCH` partial failure | Composio returns failed ranges. Agent reports `⚠️ Gravei N de M linhas; falharam: <ids>. Tenta de novo só os que faltaram?` Idempotency via unique `id` protects retry from duplicating successful writes |
| User cancels at card | CSV → `imports/cancelled/`. Cache unchanged. No writes |
| Agent crash or container restart mid-batch-write | Partially written rows stay in sheet (no rollback). Next import's `matched` bucket re-detects them as already-present. CSV stays in `inbox/` (the move to `processed/` is the final step, only after cache + writes succeed) |

## Testing

| Layer | What | Where |
|---|---|---|
| Parsers | 4 anonymized fixtures (1 BTG-PF XLS + 3 CSVs) covering each source's quirks (preamble, BOM, quoted CSV, OLE2 binary) | `container/skills/finance-csv/__tests__/parsers.test.mjs` — snapshot test of canonical JSON output, per-parser |
| Reconcile | Fixtures: canonical + sheet-dump → expected result. Scenarios: 100% match, 100% new, hybrid, recorrente, recebível, ambiguous, estorno | `__tests__/reconcile.test.ts` — per-bucket assertions |
| Classify | Cache + descricao_raw → expected categoria. Scenarios: exact, substring, no match | `__tests__/classify.test.ts` |
| End-to-end | Real anonymized CSV → full CLI run → verify output | Manual first; automate if pain emerges |

Out of scope for tests: the intent in `system-prompt.md` (tested by use), Composio calls (mock too brittle, real fakes too narrow).

## Out of scope for this design

- Editing or correcting lines from past imports (use existing `editar_lancamento` intent)
- Generating PDF/Excel reports from imports (separate intent)
- Multi-CSV batch processing in one turn (one CSV per turn)
- Statement reconciliation for credit card invoices (different schema; future work)
- Real-time webhook from banks (different problem entirely)
- Backfill of existing pre-Plan-3 lançamentos with missing `subcategoria` (out of scope per existing Plan 3 design)

## Open questions

None — all major decisions made during brainstorming.

## Affected files (summary)

**New:**
- `container/skills/finance-csv/SKILL.md`
- `container/skills/finance-csv/finance-csv` (shell wrapper)
- `container/skills/finance-csv/package.json` (declares `xlsx` dep)
- `container/skills/finance-csv/lib/cli.mjs`
- `container/skills/finance-csv/lib/fuzzy.mjs`
- `container/skills/finance-csv/lib/normalize.mjs`
- `container/skills/finance-csv/lib/parsers/{detect,btg_pf,btg_pj,inter,hotmart}.mjs`
- `container/skills/finance-csv/lib/reconcile.mjs`
- `container/skills/finance-csv/lib/classify.mjs`
- `container/skills/finance-csv/__tests__/{fuzzy,normalize,parsers,reconcile,classify}.test.mjs`
- `container/skills/finance-csv/__tests__/fixtures/{btg-pf-sample.xls, btg-pj-sample.csv, inter-pf-sample.csv, hotmart-sample.csv}` (anonymized)
- `groups/finance/classification-cache.json` (seeded during install)
- `groups/finance/hotmart-categoria-map.json` (seeded during install)
- `groups/finance/imports/{inbox,processed,cancelled}/.gitkeep`

**Modified:**
- `.claude/skills/add-finance/SKILL.md` (bootstrap step + cache seed)
- `.claude/skills/add-finance/system-prompt.md` (new intent `processar_extrato` + workflow section + tools entry + limits entry)
- Telegram attachment handler (route `.csv` mime to `imports/inbox/` instead of dropping)

## Cross-references

- Levis agent overview: `groups/finance/CLAUDE.md`, `groups/finance/system-prompt.md`
- Finance skill installer: `.claude/skills/add-finance/SKILL.md`
- Container skill precedent: `container/skills/pdf-reader/`
- Plan 3 (current finance schema): `docs/superpowers/specs/2026-05-15-finance-plan3-design.md`
- Original finance agent design: `docs/superpowers/specs/2026-05-11-finance-agent-design.md`
