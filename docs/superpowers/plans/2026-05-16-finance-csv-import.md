# Levis CSV Bank Statement Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levis can ingest a CSV bank statement (BTG / Inter / Hotmart), reconcile lines against existing sheet state (Lançamentos, Recorrentes, Recebíveis), and add the remainder in one batch-confirmed write.

**Architecture:** New container skill `finance-csv` exposes a Node CLI (`finance-csv parse | reconcile | classify`) the agent invokes via `Bash`. CLI is deterministic; agent handles only what needs judgment (classify ambiguous, render summary card, gate the write). Composio googlesheets remains the only mutation path.

**Tech Stack:** Node 22 ESM (`.mjs`, no transpile), Node built-in test runner (`node --test`), existing `pdf-reader` skill pattern (single-file CLI installed to `/usr/local/bin/`), Composio googlesheets toolkit (agent-side).

**Spec:** `docs/superpowers/specs/2026-05-16-finance-csv-extrato-bancario-design.md`

---

## Editorial deltas (applied 2026-05-16 after inspecting real exports)

Real bank exports in `/root/nanoclaw/extratos/` (gitignored) revealed format diversity beyond the original assumptions. The spec has been updated; this plan's task structure adapts as follows:

1. **4 parsers, not 3.** BTG has two export channels (PF = XLS-only, PJ = CSV quoted), Inter PF + Hotmart are CSV with their own quirks. Task 4 splits into Task 4a (BTG PF XLS) and Task 4b (BTG PJ CSV). Task 5 (Inter) gains preamble-row handling. Task 6 (Hotmart) gains `categoria_hint` extraction.
2. **`xlsx` npm package required** for BTG PF. Task 1 now also creates a `package.json` declaring `xlsx` as a dependency. Task 11 (Dockerfile) runs `npm install --prefix /usr/local/lib/finance-csv` so the package lands in the container.
3. **Canonical schema adds `categoria_hint` field** (string | null). Hotmart sets it from its `Categoria` column; other parsers set null. Task 8 (classify) treats `categoria_hint` as the highest-priority lookup (confidence 0.90, fonte `'source'`) via a separate `hotmart-categoria-map.json` colocated with the cache.
4. **`linha_id` prefix** uses snake-case 4-banks: `btg_pf-…`, `btg_pj-…`, `inter-…`, `hotmart-…` (not the original 3-bank `btg-…`).
5. **`conta_inferida` values:** `BTG D` (PF), `BTG PJ`, `Inter PF`, `Hotmart`.
6. **Telegram plumbing** (Task 15) also accepts `.xls` / `.xlsx` mime types and extensions, not just `.csv`.

When dispatching subagents per task, the controller provides task text + the relevant deltas above. The spec is the source of truth for canonical schema; this plan is the source of truth for sequencing and TDD discipline.

---

## File structure

```
container/skills/finance-csv/
├── SKILL.md                          metadata + allowed-tools
├── finance-csv                       shell wrapper (-> /usr/local/bin/finance-csv)
├── lib/
│   ├── cli.mjs                       subcommand router
│   ├── fuzzy.mjs                     token-set Jaccard
│   ├── normalize.mjs                 descricao normalization for cache keys
│   ├── parsers/
│   │   ├── detect.mjs                bank auto-detection
│   │   ├── btg.mjs                   BTG parser
│   │   ├── inter.mjs                 Inter parser
│   │   └── hotmart.mjs               Hotmart parser
│   ├── classify.mjs                  cache lookup
│   └── reconcile.mjs                 7-bucket matcher
└── __tests__/
    ├── fuzzy.test.mjs
    ├── normalize.test.mjs
    ├── parsers.test.mjs
    ├── classify.test.mjs
    ├── reconcile.test.mjs
    └── fixtures/
        ├── btg-sample.csv            anonymized real export
        ├── inter-sample.csv          idem
        └── hotmart-sample.csv        idem

container/Dockerfile                  add COPY + wrapper for finance-csv

.claude/skills/add-finance/
├── SKILL.md                          bootstrap: seed cache + create imports/ dirs
└── system-prompt.md                  new intent: processar_extrato

groups/finance/                       (RW workspace)
├── classification-cache.json         seeded on install
└── imports/
    ├── inbox/.gitkeep
    ├── processed/.gitkeep
    └── cancelled/.gitkeep

src/channels/telegram.ts              route .csv documents to imports/inbox/
                                       (and set localPath on attachment)
```

**Decomposition rationale:**
- Each parser is its own file (one file, one bank, one responsibility — easy to add a new bank later)
- `fuzzy`, `normalize`, `classify`, `reconcile` are independent units each with one job
- Tests mirror source structure 1:1
- Container skill is self-contained; agent integration changes (SKILL.md, system-prompt.md) are separate from the CLI

---

## Task 0: Build anonymized fixtures from real exports

**Files:**
- Source (already exists, gitignored, never commit): `/root/nanoclaw/extratos/`
  - `PF_Extrato_2026-04-16_a_2026-05-15_06763872500.xls` → BTG PF
  - `pj_50_008024331.csv` → BTG PJ
  - `pf_Extrato-15-04-2026-a-15-05-2026-CSV.csv` → Inter PF
  - `detailed_statement_BRL_20260516101213_3D663B6A13109588542062033378.csv` → Hotmart
- Create (anonymized, safe to commit):
  - `container/skills/finance-csv/__tests__/fixtures/btg-pf-sample.xls`
  - `container/skills/finance-csv/__tests__/fixtures/btg-pj-sample.csv`
  - `container/skills/finance-csv/__tests__/fixtures/inter-pf-sample.csv`
  - `container/skills/finance-csv/__tests__/fixtures/hotmart-sample.csv`

> **PII rule:** real exports stay in `extratos/` (gitignored). Fixtures committed to repo must have merchant names, full account numbers, and CPF/CNPJ redacted. Dates and amounts stay (needed for tests).

- [ ] **Step 1: Verify the source files exist**

Run: `ls -la /root/nanoclaw/extratos/`
Expected: at least the 4 files listed above (XLS + 3 CSVs).

If any missing, **stop and report blocker**.

- [ ] **Step 2: Inspect each source to ground parser assumptions**

```bash
# BTG PF — XLS (binary, will need xlsx package to read)
head -c 8 /root/nanoclaw/extratos/PF_Extrato_2026-04-16_a_2026-05-15_06763872500.xls | xxd
# Expected: D0CF 11E0 A1B1 1AE1 (OLE2 magic)

# BTG PJ — CSV with quoted fields, comma separator
head -3 /root/nanoclaw/extratos/pj_50_008024331.csv
# Expected: "Data","Descricao","Valor","Saldo" header + rows

# Inter PF — CSV with preamble (metadata rows BEFORE the real header)
head -10 /root/nanoclaw/extratos/pf_Extrato-15-04-2026-a-15-05-2026-CSV.csv
# Expected: "Extrato Conta Corrente", "Conta;...", "Período;..." then blank/header on row 4-5

# Hotmart — CSV with BOM + PT-BR headers + Categoria column
head -3 /root/nanoclaw/extratos/detailed_statement_BRL_*.csv
# Expected: BOM + "Data do lançamento;Data da efetivação;Status;Transação;...;Categoria"
```

Record observed: exact column names, separator, encoding, sign convention, date format. This grounds Tasks 4a–7.

- [ ] **Step 3: Build anonymized fixtures**

For each source, copy to fixtures and redact PII. Keep dates, amounts, transaction structure intact — only redact: merchant names (e.g. "Jadiel Ricardo..." → "BENEFICIARIO_1"), full account numbers in filenames, CPF/CNPJ.

For CSVs (use `sed` or Python):

```bash
# Example for BTG PJ (adapt patterns to actual file content)
python3 <<'PY'
import re, pathlib
src = pathlib.Path('/root/nanoclaw/extratos/pj_50_008024331.csv')
dst = pathlib.Path('container/skills/finance-csv/__tests__/fixtures/btg-pj-sample.csv')
content = src.read_text(encoding='utf-8')
# Redact proper names after "para" / "de"
content = re.sub(r'(para|de)\s+([A-ZÀ-Ÿ][a-zà-ÿ]+(\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)+)', r'\1 BENEFICIARIO', content)
dst.parent.mkdir(parents=True, exist_ok=True)
dst.write_text(content, encoding='utf-8')
print(f"wrote {dst}")
PY
```

Repeat the pattern for Inter PF and Hotmart. Adapt the redaction regex to each file's name patterns.

For the **BTG PF XLS**: since it's binary, the simplest anonymization is to:
1. Read with `xlsx` package (or first install: `cd container/skills/finance-csv && npm install xlsx`)
2. Replace descricao column values with `MERCHANT_<n>` style
3. Re-emit as XLS

OR, if XLS anonymization feels heavy: skip XLS fixture for now, mark BTG PF parser tests as skipped with `test.skip`, and rely on the real XLS in `extratos/` (via env var pointing to it) during manual testing. Document this in the BTG PF test file.

- [ ] **Step 4: Verify fixtures**

Run: `ls -la container/skills/finance-csv/__tests__/fixtures/`
Expected: 3 CSVs (+ optionally the anonymized XLS). All > 500 bytes.

Run: `grep -c "MERCHANT\|BENEFICIARIO" container/skills/finance-csv/__tests__/fixtures/*.csv`
Expected: non-zero count per CSV (confirms anonymization actually happened).

Run: `grep -E "[A-ZÀ-Ÿ][a-zà-ÿ]+\s+[A-ZÀ-Ÿ][a-zà-ÿ]+\s+[A-ZÀ-Ÿ][a-zà-ÿ]+" container/skills/finance-csv/__tests__/fixtures/*.csv | head`
Expected: empty (no full names remaining). If any leak, iterate redaction.

- [ ] **Step 5: Commit fixtures**

```bash
git add container/skills/finance-csv/__tests__/fixtures/
git commit -m "test(finance-csv): add anonymized fixtures (BTG PF/PJ, Inter PF, Hotmart)"
```

---

## Task 1: Skeleton directories + SKILL.md

**Files:**
- Create: `container/skills/finance-csv/SKILL.md`
- Create: `container/skills/finance-csv/lib/.gitkeep`
- Create: `container/skills/finance-csv/__tests__/.gitkeep`

- [ ] **Step 1: Create the skill directory tree**

Run:
```bash
mkdir -p container/skills/finance-csv/lib/parsers
mkdir -p container/skills/finance-csv/__tests__/fixtures
touch container/skills/finance-csv/lib/.gitkeep
```

- [ ] **Step 2: Write SKILL.md**

Create `container/skills/finance-csv/SKILL.md`:

```markdown
---
name: finance-csv
description: Parse, reconcile, and classify bank statement CSVs from BTG, Inter, and Hotmart. Use when the user uploads or references a bank statement CSV in the finance agent (Levis). Handles auto-detection of bank, deterministic matching against existing Lançamentos/Recorrentes/Recebíveis, and classification cache lookup.
allowed-tools: Bash(finance-csv:*)
---

# finance-csv

CLI for reconciling bank statement CSVs against Levis's Google Sheets workbook.

## Quick start

```bash
finance-csv parse <file.csv> [--bank btg|inter|hotmart] --out canonical.json
finance-csv classify <descricao_raw> --cache cache.json
finance-csv reconcile --csv canonical.json --sheet dump.json --cache cache.json \
    --markers groups/finance/imports/processed --out result.json
```

## Commands

### parse — Convert bank CSV to canonical JSON

```bash
finance-csv parse <file.csv>                       # auto-detect bank
finance-csv parse <file.csv> --bank btg            # override detection
finance-csv parse <file.csv> --out canonical.json  # write to file (default: stdout)
```

Output schema (per spec):
```json
{
  "banco": "btg" | "inter" | "hotmart",
  "conta_inferida": "BTG D" | "Inter PJ" | "Hotmart",
  "escopo": "PF" | "PJ",
  "periodo": { "inicio": "yyyy-mm-dd", "fim": "yyyy-mm-dd" },
  "linhas": [{ "linha_id", "data", "valor", "tipo", "descricao_raw",
               "banco_tx_id", "meio_pagamento_hint" }]
}
```

### classify — Look up categoria/subcategoria for a description

```bash
finance-csv classify "UBER *TRIP 3829" --cache groups/finance/classification-cache.json
```

Output: `{ "categoria": "Pessoal", "subcategoria": "Transporte", "fonte": "cache", "confidence": 0.95 }` or `null`.

### reconcile — Match canonical against sheet state

```bash
finance-csv reconcile \
  --csv canonical.json \
  --sheet sheet-dump.json \
  --cache groups/finance/classification-cache.json \
  --markers groups/finance/imports/processed \
  --out result.json
```

`sheet-dump.json` shape (agent assembles from Composio BATCH_GET):
```json
{
  "lancamentos":          [{ "id", "data", "tipo", "valor", "categoria", "descricao", "recorrente_id" }, ...],
  "recorrentes_ativos":   [{ "id", "codigo", "nome", "valor", "dia_do_mes", "pago_no_mes" }, ...],
  "recebiveis_esperados": [{ "id", "descricao", "valor", "data_prevista" }, ...]
}
```

Output: bucketed result per spec section "Result structure".

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Generic error (stderr has details) |
| 2 | Unknown bank (parse only — stderr shows header dump) |
| 3 | Already imported (reconcile only — stderr shows processed_at) |
| 4 | Invalid input file (missing, empty, unreadable) |
```

- [ ] **Step 3: Verify markdown renders cleanly**

Run: `cat container/skills/finance-csv/SKILL.md | head -20`
Expected: frontmatter `---name/description/allowed-tools---` parses; no broken code fences.

- [ ] **Step 4: Commit**

```bash
git add container/skills/finance-csv/
git commit -m "feat(finance-csv): scaffold container skill with SKILL.md"
```

---

## Task 2: Fuzzy matcher (token-set Jaccard)

**Files:**
- Create: `container/skills/finance-csv/lib/fuzzy.mjs`
- Create: `container/skills/finance-csv/__tests__/fuzzy.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `container/skills/finance-csv/__tests__/fuzzy.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenSetRatio } from '../lib/fuzzy.mjs';

test('identical strings score 1.0', () => {
  assert.equal(tokenSetRatio('Netflix', 'Netflix'), 1.0);
});

test('case-insensitive and whitespace-insensitive', () => {
  assert.equal(tokenSetRatio('NETFLIX  COM', 'netflix.com'), 1.0);
});

test('majority overlap scores above 0.6', () => {
  // "uber trip" tokens vs "uber rides brazil" tokens — 1 of 3 overlap
  const score = tokenSetRatio('Uber Trip', 'Uber Rides Brazil');
  assert.ok(score < 0.6, `expected <0.6 for 1/3 overlap, got ${score}`);
});

test('all tokens overlap scores 1.0', () => {
  assert.equal(tokenSetRatio('netflix com br', 'NETFLIX.COM.BR'), 1.0);
});

test('no overlap scores 0', () => {
  assert.equal(tokenSetRatio('Netflix', 'Spotify'), 0);
});

test('punctuation and asterisks are split', () => {
  // BTG description style: "UBER *TRIP 3829" vs recorrente.nome "Uber"
  // After splitting on punctuation + numbers stripped: ["uber", "trip"] vs ["uber"]
  // Jaccard = 1 / 2 = 0.5
  const score = tokenSetRatio('UBER *TRIP 3829', 'Uber');
  assert.ok(score >= 0.4 && score <= 0.6, `expected ~0.5, got ${score}`);
});

test('empty string returns 0', () => {
  assert.equal(tokenSetRatio('', 'anything'), 0);
  assert.equal(tokenSetRatio('anything', ''), 0);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test container/skills/finance-csv/__tests__/fuzzy.test.mjs`
Expected: all tests fail with "Cannot find module ../lib/fuzzy.mjs"

- [ ] **Step 3: Implement fuzzy.mjs**

Create `container/skills/finance-csv/lib/fuzzy.mjs`:

```javascript
/**
 * Token-set Jaccard similarity for descricao matching.
 * Splits on whitespace and common punctuation (incl. asterisk, slash, dot),
 * lowercases, strips standalone digit tokens, deduplicates.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} 0..1 — |intersection| / |union|
 */
export function tokenSetRatio(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersect = 0;
  for (const t of ta) if (tb.has(t)) intersect++;
  const union = ta.size + tb.size - intersect;
  return intersect / union;
}

function tokens(s) {
  return new Set(
    s
      .toLowerCase()
      .split(/[\s.,;:*/()\-_]+/u)
      .filter((t) => t.length > 0 && !/^\d+$/.test(t))
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test container/skills/finance-csv/__tests__/fuzzy.test.mjs`
Expected: 7 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add container/skills/finance-csv/lib/fuzzy.mjs container/skills/finance-csv/__tests__/fuzzy.test.mjs
git commit -m "feat(finance-csv): add token-set Jaccard fuzzy matcher"
```

---

## Task 3: Description normalization (for cache keys)

**Files:**
- Create: `container/skills/finance-csv/lib/normalize.mjs`
- Create: `container/skills/finance-csv/__tests__/normalize.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `container/skills/finance-csv/__tests__/normalize.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDescricao } from '../lib/normalize.mjs';

test('lowercases', () => {
  assert.equal(normalizeDescricao('NETFLIX'), 'netflix');
});

test('strips trailing digit tokens (transaction suffixes)', () => {
  assert.equal(normalizeDescricao('UBER *TRIP 3829'), 'uber trip');
});

test('strips *XXXX patterns inline', () => {
  assert.equal(normalizeDescricao('PAG*9982 IFOOD'), 'pag ifood');
});

test('collapses whitespace and punctuation to single space', () => {
  assert.equal(normalizeDescricao('NETFLIX.COM   BR'), 'netflix com br');
});

test('preserves alphabetic tokens with embedded digits (e.g. C1)', () => {
  // Token "c1" should survive as it identifies a card; pure-digit "1234" should not
  assert.equal(normalizeDescricao('PAGAMENTO CARTAO C1 *1234'), 'pagamento cartao c1');
});

test('handles empty / whitespace-only input', () => {
  assert.equal(normalizeDescricao(''), '');
  assert.equal(normalizeDescricao('   '), '');
});

test('latin-1 accent normalization', () => {
  // farmácia → farmacia
  assert.equal(normalizeDescricao('Farmácia São João'), 'farmacia sao joao');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test container/skills/finance-csv/__tests__/normalize.test.mjs`
Expected: all fail with module-not-found.

- [ ] **Step 3: Implement normalize.mjs**

Create `container/skills/finance-csv/lib/normalize.mjs`:

```javascript
/**
 * Normalize a bank descricao_raw for use as a cache key.
 * - lowercase
 * - strip accents (NFD + remove combining marks)
 * - strip transaction-suffix patterns: trailing digits, *XXXX inline
 * - collapse all punctuation/whitespace to single space
 * - drop pure-digit tokens (preserve mixed alphanum like "C1")
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeDescricao(raw) {
  if (!raw) return '';
  const stripped = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/\*\d+/gu, ' ')
    .replace(/[.,;:*/()\-_]+/gu, ' ')
    .split(/\s+/u)
    .filter((t) => t.length > 0 && !/^\d+$/.test(t))
    .join(' ');
  return stripped;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test container/skills/finance-csv/__tests__/normalize.test.mjs`
Expected: 7 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add container/skills/finance-csv/lib/normalize.mjs container/skills/finance-csv/__tests__/normalize.test.mjs
git commit -m "feat(finance-csv): add descricao normalization for cache keys"
```

---

## Task 4: BTG parser

**Files:**
- Create: `container/skills/finance-csv/lib/parsers/btg.mjs`
- Modify: `container/skills/finance-csv/__tests__/parsers.test.mjs` (create here)

> **Prerequisite:** `__tests__/fixtures/btg-sample.csv` from Task 0.

- [ ] **Step 1: Inspect the fixture to ground assumptions**

Run: `head -3 container/skills/finance-csv/__tests__/fixtures/btg-sample.csv`
Run: `file container/skills/finance-csv/__tests__/fixtures/btg-sample.csv`
Run: `wc -l container/skills/finance-csv/__tests__/fixtures/btg-sample.csv`

Note exact column names, separator, encoding. **If reality differs from spec table (UTF-8, `;`, `dd/mm/yyyy`, type column C/D), update spec table inline first and proceed.**

- [ ] **Step 2: Write the failing test**

Create `container/skills/finance-csv/__tests__/parsers.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseBtg } from '../lib/parsers/btg.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

test('btg: parses sample fixture into canonical schema', () => {
  const raw = readFileSync(join(FIXTURES, 'btg-sample.csv'), 'utf-8');
  const result = parseBtg(raw);

  assert.equal(result.banco, 'btg');
  assert.equal(result.escopo, 'PF');
  assert.equal(result.conta_inferida, 'BTG D');
  assert.match(result.periodo.inicio, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(result.periodo.fim, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Array.isArray(result.linhas));
  assert.ok(result.linhas.length > 0, 'expected at least one row');

  for (const linha of result.linhas) {
    assert.match(linha.linha_id, /^btg-\d{4}-\d{2}-\d{2}-\d{3}$/);
    assert.match(linha.data, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof linha.valor, 'number');
    assert.ok(linha.valor >= 0, 'valor must be non-negative');
    assert.ok(['despesa', 'receita', 'estorno', 'transferencia_interna'].includes(linha.tipo));
    assert.equal(typeof linha.descricao_raw, 'string');
  }
});

test('btg: linha_id is deterministic across re-parses', () => {
  const raw = readFileSync(join(FIXTURES, 'btg-sample.csv'), 'utf-8');
  const a = parseBtg(raw);
  const b = parseBtg(raw);
  assert.deepEqual(a.linhas.map((l) => l.linha_id), b.linhas.map((l) => l.linha_id));
});

test('btg: detects PIX hint in descricao', () => {
  const raw = readFileSync(join(FIXTURES, 'btg-sample.csv'), 'utf-8');
  const result = parseBtg(raw);
  const pixRows = result.linhas.filter((l) => l.meio_pagamento_hint === 'PIX');
  // Loose assertion — at least the structure works; PIX rows depend on fixture content
  assert.ok(pixRows.every((r) => /PIX/iu.test(r.descricao_raw)));
});

test('btg: rejects empty CSV with clear error', () => {
  assert.throws(() => parseBtg(''), /empty|header/iu);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `node --test container/skills/finance-csv/__tests__/parsers.test.mjs`
Expected: all fail with module-not-found.

- [ ] **Step 4: Implement btg.mjs**

Create `container/skills/finance-csv/lib/parsers/btg.mjs`:

```javascript
/**
 * BTG Pactual statement parser.
 * Adjust column names + separator if Task 4 Step 1 found differences.
 *
 * Expected header (canonical BTG export — adjust to match fixture):
 *   Data;Movimentação;Valor;Saldo;Tipo
 *
 * @param {string} raw — full CSV file content (UTF-8)
 * @returns {object} canonical schema
 */
export function parseBtg(raw) {
  if (!raw || raw.trim().length === 0) {
    throw new Error('empty CSV');
  }
  const lines = raw.split(/\r?\n/u).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error('CSV has header but no data rows');
  }

  const headerCols = splitSemicolon(lines[0]);
  const idx = {
    data: headerCols.findIndex((c) => /^data$/iu.test(c)),
    descricao: headerCols.findIndex((c) => /movimenta|descri/iu.test(c)),
    valor: headerCols.findIndex((c) => /^valor$/iu.test(c)),
    tipo: headerCols.findIndex((c) => /^tipo$/iu.test(c)),
  };
  if (idx.data < 0 || idx.descricao < 0 || idx.valor < 0) {
    throw new Error(`BTG header missing required columns: ${lines[0]}`);
  }

  const linhas = [];
  const seqByDate = new Map();
  let minDate = null;
  let maxDate = null;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitSemicolon(lines[i]);
    const data = parseBrDate(cols[idx.data]);
    if (!data) continue;
    const descricao_raw = cols[idx.descricao]?.trim() ?? '';
    const valorRaw = cols[idx.valor]?.trim() ?? '0';
    const valor = Math.abs(parseBrValue(valorRaw));
    const tipoCol = idx.tipo >= 0 ? cols[idx.tipo]?.trim().toUpperCase() : null;
    const tipo = inferTipo(tipoCol, valorRaw, descricao_raw);

    const seq = (seqByDate.get(data) ?? 0) + 1;
    seqByDate.set(data, seq);

    linhas.push({
      linha_id: `btg-${data}-${String(seq).padStart(3, '0')}`,
      data,
      valor,
      tipo,
      descricao_raw,
      banco_tx_id: null, // BTG export doesn't include stable tx id in the standard CSV
      meio_pagamento_hint: inferMeio(descricao_raw),
    });

    if (!minDate || data < minDate) minDate = data;
    if (!maxDate || data > maxDate) maxDate = data;
  }

  return {
    banco: 'btg',
    conta_inferida: 'BTG D',
    escopo: 'PF',
    periodo: { inicio: minDate ?? '', fim: maxDate ?? '' },
    linhas,
  };
}

function splitSemicolon(line) {
  // Naive split — fine for BTG (no quoted fields with semicolons in practice).
  // If a real fixture has quoted fields, upgrade to a CSV lib here.
  return line.split(';').map((c) => c.trim());
}

function parseBrDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/u);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function parseBrValue(s) {
  // "1.234,56" or "-80,00"
  const cleaned = s.replace(/\./gu, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function inferTipo(tipoCol, valorRaw, descricao) {
  if (/ESTORNO|REVERSAO/iu.test(descricao)) return 'estorno';
  if (/TED PROPRIA|TRANSF.*PROPRIA|ENVIO PIX.*PROPRIA/iu.test(descricao)) return 'transferencia_interna';
  if (tipoCol === 'C' || tipoCol === 'CREDITO') return 'receita';
  if (tipoCol === 'D' || tipoCol === 'DEBITO') return 'despesa';
  // Fallback: sign of valor
  return /^-/u.test(valorRaw.trim()) ? 'despesa' : 'receita';
}

function inferMeio(descricao) {
  if (/PIX/iu.test(descricao)) return 'PIX';
  if (/CARTAO|CARD|COMPRA/iu.test(descricao)) return 'Cartão C1';
  if (/BOLETO/iu.test(descricao)) return 'Boleto';
  if (/TED|TRANSF/iu.test(descricao)) return 'Transferência';
  return null;
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `node --test container/skills/finance-csv/__tests__/parsers.test.mjs`
Expected: 4 passed, 0 failed.

**If tests fail because the fixture's column names differ from the regexes** (`movimenta|descri`, `^data$`, etc.): update the regex to match the real header. Re-run. Real-CSV-driven dev means we adjust to data, not vice versa.

- [ ] **Step 6: Commit**

```bash
git add container/skills/finance-csv/lib/parsers/btg.mjs container/skills/finance-csv/__tests__/parsers.test.mjs
git commit -m "feat(finance-csv): add BTG parser with deterministic linha_id"
```

---

## Task 5: Inter parser

**Files:**
- Create: `container/skills/finance-csv/lib/parsers/inter.mjs`
- Modify: `container/skills/finance-csv/__tests__/parsers.test.mjs` (append tests)

- [ ] **Step 1: Inspect Inter fixture**

Run: `file container/skills/finance-csv/__tests__/fixtures/inter-sample.csv`
Run: `head -5 container/skills/finance-csv/__tests__/fixtures/inter-sample.csv`

Note: encoding likely Latin-1 — confirm.

- [ ] **Step 2: Append failing tests to parsers.test.mjs**

Append to `container/skills/finance-csv/__tests__/parsers.test.mjs`:

```javascript
import { parseInter } from '../lib/parsers/inter.mjs';

test('inter: parses fixture (Latin-1 handled)', () => {
  // Read as buffer; parser handles encoding internally
  const raw = readFileSync(join(FIXTURES, 'inter-sample.csv'));
  const result = parseInter(raw);
  assert.equal(result.banco, 'inter');
  assert.equal(result.escopo, 'PJ');
  assert.ok(result.linhas.length > 0);
  for (const linha of result.linhas) {
    assert.match(linha.linha_id, /^inter-\d{4}-\d{2}-\d{2}-\d{3}$/);
    assert.ok(linha.valor >= 0);
    assert.equal(linha.banco_tx_id, null); // Inter doesn't expose a stable tx id
  }
});

test('inter: negative-signed valor maps to despesa', () => {
  const raw = readFileSync(join(FIXTURES, 'inter-sample.csv'));
  const result = parseInter(raw);
  // Spot-check: there must be at least one despesa (Inter PJ has expenses)
  assert.ok(result.linhas.some((l) => l.tipo === 'despesa'));
});
```

- [ ] **Step 3: Run to verify new failure**

Run: `node --test container/skills/finance-csv/__tests__/parsers.test.mjs`
Expected: existing 4 pass + 2 new fail with module-not-found.

- [ ] **Step 4: Implement inter.mjs**

Create `container/skills/finance-csv/lib/parsers/inter.mjs`:

```javascript
import { TextDecoder } from 'node:util';

/**
 * Inter (Banco Inter) statement parser.
 * Inter exports as Latin-1 with comma separator; sign on value column.
 *
 * @param {Buffer | string} raw
 * @returns {object} canonical schema
 */
export function parseInter(raw) {
  const text = typeof raw === 'string' ? raw : decodeLatin1(raw);
  if (!text || text.trim().length === 0) throw new Error('empty CSV');

  const lines = text.split(/\r?\n/u).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV has header but no data rows');

  const headerCols = splitComma(lines[0]);
  const idx = {
    data: headerCols.findIndex((c) => /data\s*lan/iu.test(c) || /^data$/iu.test(c)),
    descricao: headerCols.findIndex((c) => /hist[óo]rico|descri/iu.test(c)),
    valor: headerCols.findIndex((c) => /^valor$/iu.test(c)),
  };
  if (idx.data < 0 || idx.descricao < 0 || idx.valor < 0) {
    throw new Error(`Inter header missing required columns: ${lines[0]}`);
  }

  const linhas = [];
  const seqByDate = new Map();
  let minDate = null;
  let maxDate = null;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitComma(lines[i]);
    const data = parseBrDate(cols[idx.data]);
    if (!data) continue;
    const descricao_raw = cols[idx.descricao]?.trim() ?? '';
    const valorRaw = cols[idx.valor]?.trim() ?? '0';
    const signed = parseBrValue(valorRaw);
    const valor = Math.abs(signed);
    const tipo = inferTipo(signed, descricao_raw);

    const seq = (seqByDate.get(data) ?? 0) + 1;
    seqByDate.set(data, seq);

    linhas.push({
      linha_id: `inter-${data}-${String(seq).padStart(3, '0')}`,
      data,
      valor,
      tipo,
      descricao_raw,
      banco_tx_id: null,
      meio_pagamento_hint: inferMeio(descricao_raw),
    });

    if (!minDate || data < minDate) minDate = data;
    if (!maxDate || data > maxDate) maxDate = data;
  }

  return {
    banco: 'inter',
    conta_inferida: 'Inter PJ',
    escopo: 'PJ',
    periodo: { inicio: minDate ?? '', fim: maxDate ?? '' },
    linhas,
  };
}

function decodeLatin1(buf) {
  return new TextDecoder('latin1').decode(buf);
}

function splitComma(line) {
  // Naive — Inter CSV rarely uses quoted fields for these columns.
  return line.split(',').map((c) => c.trim());
}

function parseBrDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/u);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function parseBrValue(s) {
  const cleaned = s.replace(/\./gu, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function inferTipo(signed, descricao) {
  if (/ESTORNO|REVERSAO/iu.test(descricao)) return 'estorno';
  if (/TED PROPRIA|TRANSF.*PROPRIA|PIX.*PROPRIA/iu.test(descricao)) return 'transferencia_interna';
  return signed < 0 ? 'despesa' : 'receita';
}

function inferMeio(descricao) {
  if (/PIX/iu.test(descricao)) return 'PIX';
  if (/CARTAO|CARD|COMPRA/iu.test(descricao)) return 'Cartão C1';
  if (/BOLETO/iu.test(descricao)) return 'Boleto';
  if (/TED|TRANSF/iu.test(descricao)) return 'Transferência';
  return null;
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `node --test container/skills/finance-csv/__tests__/parsers.test.mjs`
Expected: 6 passed, 0 failed. Adjust regexes to match real header if needed.

- [ ] **Step 6: Commit**

```bash
git add container/skills/finance-csv/lib/parsers/inter.mjs container/skills/finance-csv/__tests__/parsers.test.mjs
git commit -m "feat(finance-csv): add Inter parser with Latin-1 decoding"
```

---

## Task 6: Hotmart parser

**Files:**
- Create: `container/skills/finance-csv/lib/parsers/hotmart.mjs`
- Modify: `container/skills/finance-csv/__tests__/parsers.test.mjs` (append)

- [ ] **Step 1: Inspect Hotmart fixture**

Run: `head -5 container/skills/finance-csv/__tests__/fixtures/hotmart-sample.csv`

Hotmart exports as UTF-8 comma-separated; transaction_id column present; receitas-only (gateway = sales).

- [ ] **Step 2: Append failing tests**

Append to `container/skills/finance-csv/__tests__/parsers.test.mjs`:

```javascript
import { parseHotmart } from '../lib/parsers/hotmart.mjs';

test('hotmart: parses fixture into receitas-only canonical', () => {
  const raw = readFileSync(join(FIXTURES, 'hotmart-sample.csv'), 'utf-8');
  const result = parseHotmart(raw);
  assert.equal(result.banco, 'hotmart');
  assert.equal(result.escopo, 'PJ');
  assert.equal(result.conta_inferida, 'Hotmart');
  assert.ok(result.linhas.length > 0);
  for (const linha of result.linhas) {
    assert.equal(linha.tipo, 'receita');
    assert.ok(linha.banco_tx_id, 'hotmart provides stable tx_id');
    assert.equal(linha.meio_pagamento_hint, null);
    assert.match(linha.linha_id, /^hotmart-\d{4}-\d{2}-\d{2}-\d{3}$/);
  }
});
```

- [ ] **Step 3: Run to verify failure**

Run: `node --test container/skills/finance-csv/__tests__/parsers.test.mjs`
Expected: 7 fail (new test fails with module-not-found).

- [ ] **Step 4: Implement hotmart.mjs**

Create `container/skills/finance-csv/lib/parsers/hotmart.mjs`:

```javascript
/**
 * Hotmart sales report parser.
 * UTF-8, comma-separated, ISO dates, transaction_id column present.
 * All rows are receitas (gateway = vendas).
 *
 * @param {string} raw
 * @returns {object} canonical schema
 */
export function parseHotmart(raw) {
  if (!raw || raw.trim().length === 0) throw new Error('empty CSV');

  const lines = raw.split(/\r?\n/u).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV has header but no data rows');

  const headerCols = splitComma(lines[0]);
  const idx = {
    data: headerCols.findIndex((c) => /order_date|transaction_date|^date$/iu.test(c)),
    descricao: headerCols.findIndex((c) => /product|item|description/iu.test(c)),
    valor: headerCols.findIndex((c) => /producer_share|value|amount|net/iu.test(c)),
    tx_id: headerCols.findIndex((c) => /transaction|order_id/iu.test(c)),
  };
  if (idx.data < 0 || idx.descricao < 0 || idx.valor < 0) {
    throw new Error(`Hotmart header missing required columns: ${lines[0]}`);
  }

  const linhas = [];
  const seqByDate = new Map();
  let minDate = null;
  let maxDate = null;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitComma(lines[i]);
    const data = parseIsoDate(cols[idx.data]);
    if (!data) continue;
    const descricao_raw = cols[idx.descricao]?.trim() ?? '';
    const valor = Math.abs(parseDotValue(cols[idx.valor]));
    const banco_tx_id = idx.tx_id >= 0 ? cols[idx.tx_id]?.trim() || null : null;

    const seq = (seqByDate.get(data) ?? 0) + 1;
    seqByDate.set(data, seq);

    linhas.push({
      linha_id: `hotmart-${data}-${String(seq).padStart(3, '0')}`,
      data,
      valor,
      tipo: 'receita',
      descricao_raw,
      banco_tx_id,
      meio_pagamento_hint: null,
    });

    if (!minDate || data < minDate) minDate = data;
    if (!maxDate || data > maxDate) maxDate = data;
  }

  return {
    banco: 'hotmart',
    conta_inferida: 'Hotmart',
    escopo: 'PJ',
    periodo: { inicio: minDate ?? '', fim: maxDate ?? '' },
    linhas,
  };
}

function splitComma(line) {
  return line.split(',').map((c) => c.trim());
}

function parseIsoDate(s) {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/u);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function parseDotValue(s) {
  const n = Number(String(s ?? '').replace(/[^\d.\-]/gu, ''));
  return Number.isFinite(n) ? n : 0;
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `node --test container/skills/finance-csv/__tests__/parsers.test.mjs`
Expected: 7 passed. Adjust column-name regexes to match real header if needed.

- [ ] **Step 6: Commit**

```bash
git add container/skills/finance-csv/lib/parsers/hotmart.mjs container/skills/finance-csv/__tests__/parsers.test.mjs
git commit -m "feat(finance-csv): add Hotmart parser (receitas-only with stable tx_id)"
```

---

## Task 7: Bank auto-detection

**Files:**
- Create: `container/skills/finance-csv/lib/parsers/detect.mjs`
- Modify: `container/skills/finance-csv/__tests__/parsers.test.mjs` (append)

- [ ] **Step 1: Append failing tests**

Append to `container/skills/finance-csv/__tests__/parsers.test.mjs`:

```javascript
import { detectBank } from '../lib/parsers/detect.mjs';

test('detect: identifies each bank from its fixture header', () => {
  const btg = readFileSync(join(FIXTURES, 'btg-sample.csv'), 'utf-8');
  const inter = readFileSync(join(FIXTURES, 'inter-sample.csv')); // Buffer for Latin-1
  const hotmart = readFileSync(join(FIXTURES, 'hotmart-sample.csv'), 'utf-8');

  assert.equal(detectBank(btg), 'btg');
  assert.equal(detectBank(inter), 'inter');
  assert.equal(detectBank(hotmart), 'hotmart');
});

test('detect: returns null for unknown header', () => {
  assert.equal(detectBank('Foo,Bar,Baz\n1,2,3\n'), null);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test container/skills/finance-csv/__tests__/parsers.test.mjs`
Expected: 9 pass except the 2 new ones (module-not-found).

- [ ] **Step 3: Implement detect.mjs**

Create `container/skills/finance-csv/lib/parsers/detect.mjs`:

```javascript
import { TextDecoder } from 'node:util';

const SIGNATURES = [
  // Order matters — first match wins
  { bank: 'hotmart', pattern: /transaction_id|order_date|producer_share/iu },
  { bank: 'btg', pattern: /^data;.*movimenta|^data;.*valor/iu },
  { bank: 'inter', pattern: /data\s*lan[çc]amento|hist[óo]rico/iu },
];

/**
 * Detect bank from CSV content (reads only the first line).
 * @param {Buffer | string} raw
 * @returns {'btg' | 'inter' | 'hotmart' | null}
 */
export function detectBank(raw) {
  const text =
    typeof raw === 'string'
      ? raw
      : tryDecode(raw, ['utf-8', 'latin1']);
  const firstLine = text.split(/\r?\n/u, 1)[0] ?? '';
  for (const { bank, pattern } of SIGNATURES) {
    if (pattern.test(firstLine)) return bank;
  }
  return null;
}

function tryDecode(buf, encodings) {
  for (const enc of encodings) {
    try {
      return new TextDecoder(enc).decode(buf);
    } catch {
      // try next
    }
  }
  return buf.toString();
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test container/skills/finance-csv/__tests__/parsers.test.mjs`
Expected: 11 passed. If detection fails, examine the actual fixture header and update the relevant `pattern` regex.

- [ ] **Step 5: Commit**

```bash
git add container/skills/finance-csv/lib/parsers/detect.mjs container/skills/finance-csv/__tests__/parsers.test.mjs
git commit -m "feat(finance-csv): add bank auto-detection from CSV header"
```

---

## Task 8: Classify (cache lookup)

**Files:**
- Create: `container/skills/finance-csv/lib/classify.mjs`
- Create: `container/skills/finance-csv/__tests__/classify.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `container/skills/finance-csv/__tests__/classify.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../lib/classify.mjs';

const cache = {
  version: 1,
  patterns: [
    { match: 'uber trip', categoria: 'Pessoal', subcategoria: 'Transporte', hit_count: 23, last_seen: '2026-05-08' },
    { match: 'netflix com', categoria: 'Pessoal', subcategoria: 'Streaming', hit_count: 7, last_seen: '2026-05-03' },
    { match: 'tarifa', categoria: 'Empresarial', subcategoria: 'Tarifas Bancárias', hit_count: 0, last_seen: '2026-01-01' },
  ],
};

test('exact normalized match has high confidence', () => {
  // "UBER TRIP" normalizes to "uber trip" → exact match
  const r = classify('UBER TRIP', cache);
  assert.equal(r.categoria, 'Pessoal');
  assert.equal(r.subcategoria, 'Transporte');
  assert.equal(r.fonte, 'cache');
  assert.ok(r.confidence >= 0.9);
});

test('substring match has medium-high confidence', () => {
  // "UBER *TRIP 3829" normalizes to "uber trip" → exact match (suffixes stripped)
  // To force substring branch, use a description that has cache key as substring:
  //   "PAG NETFLIX COM BR" normalizes to "pag netflix com br" which CONTAINS "netflix com"
  const r = classify('PAG NETFLIX COM BR', cache);
  assert.equal(r.categoria, 'Pessoal');
  assert.equal(r.subcategoria, 'Streaming');
  assert.equal(r.fonte, 'cache');
  assert.ok(r.confidence >= 0.7 && r.confidence < 0.9);
});

test('no match returns null', () => {
  assert.equal(classify('COMPRA DESCONHECIDA XYZ', cache), null);
});

test('seed patterns work case-insensitively for fees', () => {
  const r = classify('TARIFA TED ENVIADA', cache);
  assert.equal(r.subcategoria, 'Tarifas Bancárias');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test container/skills/finance-csv/__tests__/classify.test.mjs`
Expected: 4 fail with module-not-found.

- [ ] **Step 3: Implement classify.mjs**

Create `container/skills/finance-csv/lib/classify.mjs`:

```javascript
import { normalizeDescricao } from './normalize.mjs';

/**
 * Look up a classification for a description using the cache.
 *
 * @param {string} descricao_raw
 * @param {{ version: number, patterns: Array<{match: string, categoria: string, subcategoria: string, meio_pagamento_hint?: string|null}> }} cache
 * @returns {{ categoria: string, subcategoria: string, meio_pagamento_hint?: string|null, fonte: 'cache', confidence: number } | null}
 */
export function classify(descricao_raw, cache) {
  const normalized = normalizeDescricao(descricao_raw);
  if (!normalized) return null;
  const patterns = cache?.patterns ?? [];

  // 1. Exact match
  for (const p of patterns) {
    if (normalized === p.match) {
      return {
        categoria: p.categoria,
        subcategoria: p.subcategoria,
        meio_pagamento_hint: p.meio_pagamento_hint ?? null,
        fonte: 'cache',
        confidence: 0.95,
      };
    }
  }

  // 2. Substring match (longest pattern wins to prefer specificity)
  const sorted = [...patterns].sort((a, b) => b.match.length - a.match.length);
  for (const p of sorted) {
    if (normalized.includes(p.match)) {
      return {
        categoria: p.categoria,
        subcategoria: p.subcategoria,
        meio_pagamento_hint: p.meio_pagamento_hint ?? null,
        fonte: 'cache',
        confidence: 0.8,
      };
    }
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test container/skills/finance-csv/__tests__/classify.test.mjs`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add container/skills/finance-csv/lib/classify.mjs container/skills/finance-csv/__tests__/classify.test.mjs
git commit -m "feat(finance-csv): add classification cache lookup"
```

---

## Task 9: Reconcile (the 7-bucket matcher)

**Files:**
- Create: `container/skills/finance-csv/lib/reconcile.mjs`
- Create: `container/skills/finance-csv/__tests__/reconcile.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `container/skills/finance-csv/__tests__/reconcile.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../lib/reconcile.mjs';

const cache = { version: 1, patterns: [{ match: 'uber trip', categoria: 'Pessoal', subcategoria: 'Transporte', hit_count: 10, last_seen: '2026-05-01' }] };

function canonical(linhas) {
  return { banco: 'btg', conta_inferida: 'BTG D', escopo: 'PF',
           periodo: { inicio: '2026-05-01', fim: '2026-05-31' }, linhas };
}

test('matched bucket: exact valor + ±1 day + same tipo', () => {
  const csv = canonical([
    { linha_id: 'btg-2026-05-05-001', data: '2026-05-05', valor: 80, tipo: 'despesa', descricao_raw: 'UBER', banco_tx_id: null, meio_pagamento_hint: 'Cartão C1' },
  ]);
  const sheet = {
    lancamentos: [{ id: 'lan-abc123', data: '2026-05-05', tipo: 'despesa', valor: 80, categoria: 'Pessoal', descricao: 'Uber', recorrente_id: '' }],
    recorrentes_ativos: [],
    recebiveis_esperados: [],
  };
  const r = reconcile(csv, sheet, cache, new Set());
  assert.equal(r.summary.matched, 1);
  assert.equal(r.matched[0].lan_id, 'lan-abc123');
});

test('candidato_recorrente bucket: valor + dia tolerance + name fuzz', () => {
  const csv = canonical([
    { linha_id: 'btg-2026-05-03-001', data: '2026-05-03', valor: 55.9, tipo: 'despesa', descricao_raw: 'NETFLIX.COM', banco_tx_id: null, meio_pagamento_hint: 'Cartão C1' },
  ]);
  const sheet = {
    lancamentos: [],
    recorrentes_ativos: [{ id: 'rec-net001', codigo: 'PES-STR-001', nome: 'Netflix', valor: 55.9, dia_do_mes: 3, pago_no_mes: false }],
    recebiveis_esperados: [],
  };
  const r = reconcile(csv, sheet, cache, new Set());
  assert.equal(r.summary.candidato_recorrente, 1);
  assert.equal(r.candidato_recorrente[0].recorrente_id, 'rec-net001');
});

test('candidato_recebivel bucket: receita matching Recebíveis pendente', () => {
  const csv = canonical([
    { linha_id: 'btg-2026-05-06-001', data: '2026-05-06', valor: 2300, tipo: 'receita', descricao_raw: 'HOTMART', banco_tx_id: null, meio_pagamento_hint: null },
  ]);
  const sheet = {
    lancamentos: [],
    recorrentes_ativos: [],
    recebiveis_esperados: [{ id: 'reb-001', descricao: 'Hotmart julho', valor: 2300, data_prevista: '2026-05-05' }],
  };
  const r = reconcile(csv, sheet, cache, new Set());
  assert.equal(r.summary.candidato_recebivel, 1);
  assert.equal(r.candidato_recebivel[0].recebivel_id, 'reb-001');
});

test('skipped_reimport bucket: linha_id in markers', () => {
  const csv = canonical([
    { linha_id: 'btg-2026-05-05-001', data: '2026-05-05', valor: 80, tipo: 'despesa', descricao_raw: 'UBER', banco_tx_id: null, meio_pagamento_hint: 'Cartão C1' },
  ]);
  const sheet = { lancamentos: [], recorrentes_ativos: [], recebiveis_esperados: [] };
  const r = reconcile(csv, sheet, cache, new Set(['btg-2026-05-05-001']));
  assert.equal(r.summary.skipped_reimport, 1);
});

test('to_add bucket: unmatched lines fall through with classification', () => {
  const csv = canonical([
    { linha_id: 'btg-2026-05-07-001', data: '2026-05-07', valor: 22, tipo: 'despesa', descricao_raw: 'UBER *TRIP 1111', banco_tx_id: null, meio_pagamento_hint: 'Cartão C1' },
  ]);
  const sheet = { lancamentos: [], recorrentes_ativos: [], recebiveis_esperados: [] };
  const r = reconcile(csv, sheet, cache, new Set());
  assert.equal(r.summary.to_add, 1);
  assert.equal(r.to_add[0].sugestao.categoria, 'Pessoal');
  assert.equal(r.to_add[0].sugestao.subcategoria, 'Transporte');
  assert.equal(r.to_add[0].sugestao.fonte, 'cache');
});

test('ambiguous bucket: multiple lançamento candidates', () => {
  const csv = canonical([
    { linha_id: 'btg-2026-05-07-001', data: '2026-05-07', valor: 45, tipo: 'despesa', descricao_raw: 'XPTO', banco_tx_id: null, meio_pagamento_hint: null },
  ]);
  const sheet = {
    lancamentos: [
      { id: 'lan-aaa111', data: '2026-05-07', tipo: 'despesa', valor: 45, categoria: 'Pessoal', descricao: 'A', recorrente_id: '' },
      { id: 'lan-bbb222', data: '2026-05-08', tipo: 'despesa', valor: 45, categoria: 'Pessoal', descricao: 'B', recorrente_id: '' },
    ],
    recorrentes_ativos: [],
    recebiveis_esperados: [],
  };
  const r = reconcile(csv, sheet, cache, new Set());
  assert.equal(r.summary.ambiguous, 1);
  assert.equal(r.ambiguous[0].candidatos.length, 2);
});

test('estorno_match bucket: estorno finds the original despesa', () => {
  const csv = canonical([
    { linha_id: 'btg-2026-05-10-001', data: '2026-05-10', valor: 80, tipo: 'estorno', descricao_raw: 'ESTORNO UBER', banco_tx_id: null, meio_pagamento_hint: null },
  ]);
  const sheet = {
    lancamentos: [{ id: 'lan-orig999', data: '2026-05-05', tipo: 'despesa', valor: 80, categoria: 'Pessoal', descricao: 'Uber', recorrente_id: '' }],
    recorrentes_ativos: [],
    recebiveis_esperados: [],
  };
  const r = reconcile(csv, sheet, cache, new Set());
  assert.equal(r.summary.estorno_match, 1);
  assert.equal(r.estorno_match[0].lan_id_to_delete, 'lan-orig999');
});

test('transferencia_interna bucket: silent count', () => {
  const csv = canonical([
    { linha_id: 'btg-2026-05-11-001', data: '2026-05-11', valor: 500, tipo: 'transferencia_interna', descricao_raw: 'TED PROPRIA', banco_tx_id: null, meio_pagamento_hint: 'Transferência' },
  ]);
  const sheet = { lancamentos: [], recorrentes_ativos: [], recebiveis_esperados: [] };
  const r = reconcile(csv, sheet, cache, new Set());
  assert.equal(r.summary.transferencia_interna, 1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test container/skills/finance-csv/__tests__/reconcile.test.mjs`
Expected: 8 fail with module-not-found.

- [ ] **Step 3: Implement reconcile.mjs**

Create `container/skills/finance-csv/lib/reconcile.mjs`:

```javascript
import { classify } from './classify.mjs';
import { tokenSetRatio } from './fuzzy.mjs';

const VALOR_TOL_REC = 0.5;           // R$ tolerance for recurring + receivables
const DIA_TOL_REC = 3;               // days tolerance for recorrente.dia_do_mes
const DATA_TOL_REB = 5;              // days tolerance for recebivel match
const DATA_TOL_LAN = 1;              // days tolerance for lançamento match
const ESTORNO_LOOKBACK = 7;          // days to look back for original despesa
const NAME_FUZZ_THRESHOLD = 0.6;     // recorrente.nome fuzzy match

/**
 * Reconcile a canonical CSV against current sheet state.
 *
 * @param {object} canonical — output of parse
 * @param {{lancamentos: Array, recorrentes_ativos: Array, recebiveis_esperados: Array}} sheet
 * @param {object} cache — classification cache
 * @param {Set<string>} markerSet — union of linha_ids from prior imports
 * @returns {object} result
 */
export function reconcile(canonical, sheet, cache, markerSet) {
  const buckets = {
    matched: [],
    candidato_recorrente: [],
    candidato_recebivel: [],
    estorno_match: [],
    transferencia_interna: [],
    to_add: [],
    ambiguous: [],
    skipped_reimport: [],
  };

  for (const linha of canonical.linhas) {
    if (markerSet.has(linha.linha_id)) {
      buckets.skipped_reimport.push({ linha });
      continue;
    }

    if (linha.tipo === 'despesa' && matchRecorrente(linha, sheet.recorrentes_ativos, buckets)) continue;
    if (linha.tipo === 'receita' && matchRecebivel(linha, sheet.recebiveis_esperados, buckets)) continue;
    if (matchLancamento(linha, sheet.lancamentos, buckets)) continue;

    if (linha.tipo === 'estorno') {
      matchEstorno(linha, sheet.lancamentos, buckets);
      continue;
    }
    if (linha.tipo === 'transferencia_interna') {
      buckets.transferencia_interna.push({ linha });
      continue;
    }

    buckets.to_add.push({ linha, sugestao: classify(linha.descricao_raw, cache) ?? { categoria: null, subcategoria: null, fonte: null, confidence: 0 } });
  }

  const summary = {
    total_linhas: canonical.linhas.length,
    matched: buckets.matched.length,
    candidato_recorrente: buckets.candidato_recorrente.length,
    candidato_recebivel: buckets.candidato_recebivel.length,
    estorno_match: buckets.estorno_match.length,
    transferencia_interna: buckets.transferencia_interna.length,
    to_add: buckets.to_add.length,
    skipped_reimport: buckets.skipped_reimport.length,
    ambiguous: buckets.ambiguous.length,
  };

  return { summary, ...buckets };
}

function matchRecorrente(linha, recorrentes, buckets) {
  for (const rec of recorrentes) {
    if (rec.pago_no_mes) continue;
    if (Math.abs(rec.valor - linha.valor) > VALOR_TOL_REC) continue;
    const dia = Number(linha.data.slice(8, 10));
    if (Math.abs(rec.dia_do_mes - dia) > DIA_TOL_REC) continue;
    if (tokenSetRatio(linha.descricao_raw, rec.nome) <= NAME_FUZZ_THRESHOLD) continue;
    buckets.candidato_recorrente.push({
      linha,
      recorrente_id: rec.id,
      recorrente_codigo: rec.codigo,
      recorrente_nome: rec.nome,
      action: 'marcar_pago',
    });
    return true;
  }
  return false;
}

function matchRecebivel(linha, recebiveis, buckets) {
  for (const reb of recebiveis) {
    if (Math.abs(reb.valor - linha.valor) > VALOR_TOL_REC) continue;
    if (daysBetween(reb.data_prevista, linha.data) > DATA_TOL_REB) continue;
    buckets.candidato_recebivel.push({
      linha,
      recebivel_id: reb.id,
      recebivel_descricao: reb.descricao,
      action: 'confirmar_recebimento',
    });
    return true;
  }
  return false;
}

function matchLancamento(linha, lancamentos, buckets) {
  const candidatos = [];
  for (const lan of lancamentos) {
    if (lan.tipo !== linha.tipo) continue;
    if (Number(lan.valor) !== linha.valor) continue;
    if (daysBetween(lan.data, linha.data) > DATA_TOL_LAN) continue;
    candidatos.push(lan);
  }
  if (candidatos.length === 1) {
    buckets.matched.push({ linha, lan_id: candidatos[0].id, confidence: 1.0 });
    return true;
  }
  if (candidatos.length > 1) {
    buckets.ambiguous.push({ linha, candidatos: candidatos.map((c) => ({ lan_id: c.id, data: c.data, descricao: c.descricao })) });
    return true;
  }
  return false;
}

function matchEstorno(linha, lancamentos, buckets) {
  for (const lan of lancamentos) {
    if (lan.tipo !== 'despesa') continue;
    if (Math.abs(Number(lan.valor) - linha.valor) > 0.01) continue;
    if (daysBetween(lan.data, linha.data) > ESTORNO_LOOKBACK) continue;
    if (tokenSetRatio(lan.descricao, linha.descricao_raw) < 0.3) continue;
    buckets.estorno_match.push({ linha, lan_id_to_delete: lan.id });
    return;
  }
  // No match: treat as a receita with ESTORNO prefix
  buckets.to_add.push({
    linha: { ...linha, tipo: 'receita', descricao_raw: `ESTORNO: ${linha.descricao_raw}` },
    sugestao: { categoria: null, subcategoria: null, fonte: null, confidence: 0 },
  });
}

function daysBetween(a, b) {
  const da = new Date(a + 'T00:00:00Z').getTime();
  const db = new Date(b + 'T00:00:00Z').getTime();
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test container/skills/finance-csv/__tests__/reconcile.test.mjs`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add container/skills/finance-csv/lib/reconcile.mjs container/skills/finance-csv/__tests__/reconcile.test.mjs
git commit -m "feat(finance-csv): add reconcile with 7-bucket matching"
```

---

## Task 10: CLI subcommand router

**Files:**
- Create: `container/skills/finance-csv/lib/cli.mjs`
- Create: `container/skills/finance-csv/finance-csv` (shell wrapper)

- [ ] **Step 1: Implement cli.mjs**

Create `container/skills/finance-csv/lib/cli.mjs`:

```javascript
#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { detectBank } from './parsers/detect.mjs';
import { parseBtg } from './parsers/btg.mjs';
import { parseInter } from './parsers/inter.mjs';
import { parseHotmart } from './parsers/hotmart.mjs';
import { classify } from './classify.mjs';
import { reconcile } from './reconcile.mjs';

const argv = process.argv.slice(2);
const [cmd, ...rest] = argv;

const args = parseArgs(rest);

try {
  switch (cmd) {
    case 'parse':    runParse(args); break;
    case 'classify': runClassify(args); break;
    case 'reconcile':runReconcile(args); break;
    case 'help':
    case '--help':
    case undefined:  printHelp(); break;
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      process.exit(1);
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(err.exitCode ?? 1);
}

function parseArgs(rest) {
  const out = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) {
      out[a.slice(2)] = rest[i + 1];
      i++;
    } else {
      out._.push(a);
    }
  }
  return out;
}

function runParse(args) {
  const file = args._[0];
  if (!file || !existsSync(file)) {
    const e = new Error(`file not found: ${file}`);
    e.exitCode = 4;
    throw e;
  }
  const buf = readFileSync(file);
  const bank = args.bank ?? detectBank(buf);
  if (!bank) {
    const head = buf.toString('utf-8').slice(0, 200);
    const e = new Error(`unknown bank — header: ${head}`);
    e.exitCode = 2;
    throw e;
  }
  let result;
  if (bank === 'btg') result = parseBtg(buf.toString('utf-8'));
  else if (bank === 'inter') result = parseInter(buf); // parseInter handles Latin-1
  else if (bank === 'hotmart') result = parseHotmart(buf.toString('utf-8'));
  else throw new Error(`unsupported bank: ${bank}`);

  emit(result, args.out);
}

function runClassify(args) {
  const desc = args._[0];
  if (!desc) throw new Error('usage: finance-csv classify <descricao> --cache <path>');
  const cache = JSON.parse(readFileSync(args.cache, 'utf-8'));
  const r = classify(desc, cache);
  process.stdout.write(JSON.stringify(r, null, 2) + '\n');
}

function runReconcile(args) {
  const canonical = JSON.parse(readFileSync(args.csv, 'utf-8'));
  const sheet = JSON.parse(readFileSync(args.sheet, 'utf-8'));
  const cache = args.cache && existsSync(args.cache)
    ? JSON.parse(readFileSync(args.cache, 'utf-8'))
    : { version: 1, patterns: [] };
  const markers = loadMarkers(args.markers);
  const result = reconcile(canonical, sheet, cache, markers);
  emit(result, args.out);
}

function loadMarkers(dir) {
  const set = new Set();
  if (!dir || !existsSync(dir)) return set;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.summary.json')) continue;
    try {
      const s = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
      const ids = s?.linha_ids ?? [];
      for (const id of ids) set.add(id);
    } catch {
      // ignore corrupt marker; reconcile will simply not skip those linha_ids
    }
  }
  return set;
}

function emit(obj, outPath) {
  const json = JSON.stringify(obj, null, 2);
  if (outPath) {
    mkdirSync(dirOf(outPath), { recursive: true });
    writeFileSync(outPath, json);
  } else {
    process.stdout.write(json + '\n');
  }
}

function dirOf(p) {
  const idx = p.lastIndexOf('/');
  return idx > 0 ? p.slice(0, idx) : '.';
}

function printHelp() {
  process.stdout.write(`finance-csv — parse/classify/reconcile bank statement CSVs

Commands:
  parse <file.csv> [--bank btg|inter|hotmart] [--out <path>]
  classify <descricao> --cache <path>
  reconcile --csv <canonical.json> --sheet <dump.json> --cache <path> --markers <dir> [--out <path>]
  help

Exit codes:
  0 success | 1 generic | 2 unknown bank | 3 already imported | 4 file missing
`);
}
```

- [ ] **Step 2: Implement shell wrapper**

Create `container/skills/finance-csv/finance-csv`:

```bash
#!/bin/bash
exec node /usr/local/lib/finance-csv/cli.mjs "$@"
```

Make executable:
```bash
chmod +x container/skills/finance-csv/finance-csv
```

- [ ] **Step 3: Smoke-test CLI locally (host)**

Run from project root:
```bash
node container/skills/finance-csv/lib/cli.mjs parse \
  container/skills/finance-csv/__tests__/fixtures/btg-sample.csv \
  --out /tmp/btg-canonical.json
```

Expected: exit 0, `/tmp/btg-canonical.json` exists with `{banco: "btg", linhas: [...]}`.

```bash
node container/skills/finance-csv/lib/cli.mjs parse \
  container/skills/finance-csv/__tests__/fixtures/btg-sample.csv \
  | head -20
```

Expected: JSON canonical schema on stdout.

```bash
node container/skills/finance-csv/lib/cli.mjs parse /nonexistent.csv
```

Expected: exit 4, stderr `Error: file not found: /nonexistent.csv`.

- [ ] **Step 4: Commit**

```bash
git add container/skills/finance-csv/lib/cli.mjs container/skills/finance-csv/finance-csv
git commit -m "feat(finance-csv): add CLI router and shell wrapper"
```

---

## Task 11: Dockerfile + container build

**Files:**
- Modify: `container/Dockerfile`

- [ ] **Step 1: Read existing Dockerfile to find insertion point**

Run: `grep -n "pdf-reader\|image-gen" container/Dockerfile`

Note the line range where existing CLIs are installed. We mirror that pattern but add a directory copy instead of single-file.

- [ ] **Step 2: Add finance-csv install steps**

Open `container/Dockerfile`. After the `image-gen` install block (around the line your grep found), add:

```dockerfile
# Install finance-csv CLI
COPY skills/finance-csv/lib /usr/local/lib/finance-csv
COPY skills/finance-csv/finance-csv /usr/local/bin/finance-csv
RUN chmod +x /usr/local/bin/finance-csv
```

- [ ] **Step 3: Rebuild container (prune cache to bypass stale COPY)**

Per CLAUDE.md ("Container Build Cache"), `--no-cache` alone doesn't invalidate COPY. Force-prune the builder:

Run:
```bash
docker buildx prune -af && ./container/build.sh
```

Expected: build completes; final image tagged per `build.sh`'s output.

- [ ] **Step 4: Smoke-test inside the container**

Run:
```bash
docker run --rm $(docker images -q nanoclaw-agent:latest | head -1) finance-csv help
```

Expected: prints the help block from cli.mjs.

Run:
```bash
# Bind-mount the fixture and parse inside the container
docker run --rm -v "$(pwd)/container/skills/finance-csv/__tests__/fixtures:/tmp/fx:ro" \
  $(docker images -q nanoclaw-agent:latest | head -1) \
  finance-csv parse /tmp/fx/btg-sample.csv
```

Expected: canonical JSON on stdout.

- [ ] **Step 5: Commit**

```bash
git add container/Dockerfile
git commit -m "build(container): install finance-csv CLI"
```

---

## Task 12: Group folder + cache seed in skill installer

**Files:**
- Modify: `.claude/skills/add-finance/SKILL.md`
- Create: `.claude/skills/add-finance/classification-cache-seed.json`
- Create: `groups/finance/imports/inbox/.gitkeep`
- Create: `groups/finance/imports/processed/.gitkeep`
- Create: `groups/finance/imports/cancelled/.gitkeep`

- [ ] **Step 1: Create the imports directory structure**

Run:
```bash
mkdir -p groups/finance/imports/inbox groups/finance/imports/processed groups/finance/imports/cancelled
touch groups/finance/imports/inbox/.gitkeep groups/finance/imports/processed/.gitkeep groups/finance/imports/cancelled/.gitkeep
```

- [ ] **Step 2: Create the seed cache file**

Create `.claude/skills/add-finance/classification-cache-seed.json`:

```json
{
  "version": 1,
  "patterns": [
    { "match": "tarifa", "categoria": "Empresarial", "subcategoria": "Tarifas Bancárias", "hit_count": 0, "last_seen": "2026-05-16" },
    { "match": "iof", "categoria": "Empresarial", "subcategoria": "Tarifas Bancárias", "hit_count": 0, "last_seen": "2026-05-16" },
    { "match": "anuidade", "categoria": "Pessoal", "subcategoria": "Tarifas Bancárias", "hit_count": 0, "last_seen": "2026-05-16" },
    { "match": "juros", "categoria": "Empresarial", "subcategoria": "Tarifas Bancárias", "hit_count": 0, "last_seen": "2026-05-16" }
  ]
}
```

- [ ] **Step 3: Read existing SKILL.md to find the bootstrap section**

Run: `grep -n "bootstrap\|cron\|migration\|## " .claude/skills/add-finance/SKILL.md | head -30`

Identify where bootstrap/migration steps are described — typically near the end after toolkit setup.

- [ ] **Step 4: Add bootstrap step to SKILL.md**

In `.claude/skills/add-finance/SKILL.md`, find the section that describes initial workspace setup. Append (or insert in the appropriate section) the following block:

```markdown
### CSV import bootstrap

When installing the finance agent (first time or upgrading), also:

1. Create the imports/ directory tree:
   ```bash
   mkdir -p groups/finance/imports/inbox groups/finance/imports/processed groups/finance/imports/cancelled
   touch groups/finance/imports/inbox/.gitkeep groups/finance/imports/processed/.gitkeep groups/finance/imports/cancelled/.gitkeep
   ```

2. Seed the classification cache (only if missing — never overwrite an existing cache):
   ```bash
   if [ ! -f groups/finance/classification-cache.json ]; then
     cp .claude/skills/add-finance/classification-cache-seed.json groups/finance/classification-cache.json
   fi
   ```

3. If `Subcategorias` sheet does not yet contain "Tarifas Bancárias", add it (Plan 3 schema):
   - escopo: `global`
   - categoria_pai: `Empresarial`
   - codigo_prefixo: `TAR`
   - sensibilidade: `nenhuma`
   - nao_sugerir_corte: `FALSE`
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/add-finance/SKILL.md .claude/skills/add-finance/classification-cache-seed.json groups/finance/imports/
git commit -m "feat(add-finance): seed classification cache + imports/ tree for CSV bootstrap"
```

---

## Task 13: Update Levis's CLAUDE.md (tool mention + paths)

**Files:**
- Modify: `groups/finance/CLAUDE.md`

- [ ] **Step 1: Find the "Tools que você usa" section**

Run: `grep -n "Tools que" groups/finance/CLAUDE.md`

- [ ] **Step 2: Append finance-csv to the tools list**

In the "Tools que você usa" section of `groups/finance/CLAUDE.md`, after the existing Composio googlesheets bullets, add:

```markdown
**CLI no container (via `Bash`):**

- `finance-csv parse <file>` — parseia CSV de extrato (BTG/Inter/Hotmart) pro schema canônico
- `finance-csv reconcile --csv ... --sheet ... --cache ... --markers ...` — bucketiza linhas vs estado da sheet
- `finance-csv classify "<descricao>" --cache <path>` — lookup de cat/subcat no cache

Workspace paths:
- `/workspace/agent/imports/inbox/` — CSVs recebidos via Telegram aguardando processamento
- `/workspace/agent/imports/processed/` — CSVs já importados (+ `.summary.json` por arquivo)
- `/workspace/agent/imports/cancelled/` — CSVs que o user cancelou no card
- `/workspace/agent/classification-cache.json` — patterns aprendidos (lê com `Read`, atualiza com `Write`)
```

- [ ] **Step 3: Append to "Capacidades ativas" list**

Find the "Capacidades ativas" section. Append:

```markdown
- ✅ Import de CSV de extrato (BTG, Inter, Hotmart) com conciliação automática + classificação via cache (intent `processar_extrato`)
```

- [ ] **Step 4: Commit**

```bash
git add groups/finance/CLAUDE.md
git commit -m "docs(finance): document finance-csv tool and imports/ paths in Levis CLAUDE.md"
```

---

## Task 14: Add `processar_extrato` intent to system-prompt

**Files:**
- Modify: `.claude/skills/add-finance/system-prompt.md`

- [ ] **Step 1: Find the intents table**

Run: `grep -n "Vocabulário de intents\|| Intent \|cortar_recorrente" .claude/skills/add-finance/system-prompt.md | head -10`

- [ ] **Step 2: Add row to the intents table**

In the intents table in `.claude/skills/add-finance/system-prompt.md`, after the `cortar_recorrente` row, add:

```markdown
| `processar_extrato` | mensagem com **anexo .csv** OU "processa esse extrato", "importa o extrato", "concilia o csv" | Workflow especial — ver seção **"Intent `processar_extrato` — workflow detalhado"** abaixo |
```

- [ ] **Step 3: Add the detailed workflow section**

After the existing `## Intent `exportar_doc` — workflow detalhado` section, add a sibling section:

```markdown
## Intent `processar_extrato` — workflow detalhado

Quando chegar um CSV (anexo no Telegram com mime `text/csv` ou nome terminando em `.csv`), o canal salva em `/workspace/agent/imports/inbox/<file>.csv` e a mensagem do user inclui `[document: <file>.csv — saved to /workspace/agent/imports/inbox/<file>.csv]`. Você dispara este workflow.

**Princípio:** o write final é gateado por **um único** card de confirmação batch. Antes disso, tudo é leitura / análise.

**Workflow:**

1. **Parse o CSV** via Bash:
   ```bash
   finance-csv parse /workspace/agent/imports/inbox/<file>.csv --out /tmp/canonical.json
   ```
   Se exit ≠ 0: leia stderr, mande `❌ Não consegui ler o CSV: <mensagem>` ao user, deixe o arquivo onde está (não move). Pare.

2. **Carregue estado da sheet** via Composio (uma única chamada `GOOGLESHEETS_BATCH_GET` com três ranges):
   - `Lançamentos-{escopo}!A2:M1000` (últimos 60 dias relevantes; corte por data em memória)
   - `Recorrentes!A2:Z200` (filtre `status=ATIVO` em memória)
   - `Recebíveis!A2:Z200` (filtre `status=esperado` em memória)
   - O `escopo` vem do `conta_inferida` no canonical (BTG → PF, Inter/Hotmart → PJ)
   - Monte um JSON `/tmp/sheet-dump.json` no shape esperado pelo `reconcile` (veja `container/skills/finance-csv/SKILL.md`).

3. **Reconcile** via Bash:
   ```bash
   finance-csv reconcile \
     --csv /tmp/canonical.json \
     --sheet /tmp/sheet-dump.json \
     --cache /workspace/agent/classification-cache.json \
     --markers /workspace/agent/imports/processed \
     --out /tmp/result.json
   ```
   Se exit = 3 (já importado): reporte `⚠️ Esse arquivo já foi importado em <processed_at>. Quer forçar reimportação?` (se sim, mova o `.summary.json` correspondente pra `imports/processed/.archived/` e re-rode). Pare.

4. **Classifique os `to_add` sem `sugestao.categoria`** (fonte `null`):
   - Para cada um, leia o doc canônico (`Read /workspace/agent/Controle_Despesas_Jonas_DOC.md`) **uma vez** por turno se ainda não leu, procure regras de classificação compatíveis
   - Se não conseguir classificar com confiança ≥ 0,6: deixe como `❌` no card (user precisa classificar manualmente)

5. **Renderize o card de confirmação** (formato `processar_extrato` na seção "Card de confirmação" — veja abaixo).

6. **Processe edits** em loop. Para cada edit comando do user (`edita N → ...`, `pula N`, etc.):
   - Atualize estado em memória
   - Re-renderize o card (sem escrever)

7. **Confirm:** execute em sequência (cada bloqueia o próximo):
   - `UPDATE_VALUES_BATCH` em `Lançamentos-{escopo}` para todas as linhas do `to_add` (até 100 por batch; se >100, divida em batches sequenciais)
   - `UPDATE_VALUES_BATCH` em `Recorrentes` setando `pago_no_mes=TRUE` para cada item de `candidato_recorrente`
   - `UPDATE_VALUES_BATCH` em `Recebíveis` setando `status='recebido'` + `recebido_em=<linha.data>` para cada `candidato_recebivel`
   - Para cada `estorno_match`: `CLEAR_VALUES` na range exata do `lan_id_to_delete`
   - `Write /workspace/agent/classification-cache.json` com cache atualizado (incremente `hit_count`, atualize `last_seen`, faça upsert dos novos patterns aprendidos)
   - `Bash: mv /workspace/agent/imports/inbox/<file>.csv /workspace/agent/imports/processed/<file>.csv` + crie `<file>.summary.json` com `{linha_ids: [...], processed_at: <ISO>, summary: <result.summary>}`

8. **Resposta final ao user**: `✅ <N> lançamentos gravados. <K> recorrentes marcados. <M> recebíveis confirmados.`

**Cancelar:** se o user disser "cancela" antes do confirm:
- `Bash: mv /workspace/agent/imports/inbox/<file>.csv /workspace/agent/imports/cancelled/<file>.csv`
- Sem write. Sem update de cache.

### Card de confirmação — `processar_extrato`

```
📥 Extrato {Banco} — {mês/ano}
{N} linhas analisadas

✅ Já gravados ({matched}) — pulei
🔁 Recorrentes ({K}) — vou marcar como pago:
   {N}. {nome} R$ {valor} (dia {dia})
   ...

💰 Recebíveis ({M}) — vou confirmar:
   {N}. {descricao} R$ {valor} (esperado {data_prev}, caiu {data})
   ...

🆕 Novos lançamentos ({P}):

   📁 {Categoria} / {Subcategoria} ({n} itens, R$ {total})
      {N}. {descricao} R$ {valor}    {dd/mm}  {cache|ia|ia⚠️|❌}
      ...

⚠️ {Q} ambíguos:
   {N}. R$ {valor} em {dd/mm} — bate com {x} lançamentos. Qual?

Total novo a gravar: R$ {soma}
Conta: {conta_inferida} | Meio inferido por linha

[✓ Confirmar tudo]  [✏️ Editar linha N]  [❌ Cancelar]
```

**Marcadores em cada linha:**
- `cache` — veio do `classification-cache.json` (confiança alta)
- `ia` — você classificou agora (confiança média)
- `ia ⚠️` — você classificou em subcategoria sensível (Saúde/Educação/Dívidas com prazo) — usuário precisa revisar
- `❌` — não consegui classificar; user precisa preencher antes do confirm

**Grammar de edits aceitos:**
- `edita 20 → Pessoal/Lazer` — muda categoria/subcategoria de uma linha
- `edita 18 19 → conta Inter` — muda campo em batch
- `pula 21` — remove linha do batch (não grava)
- `confirma` / `sim` / `ok` — grava tudo
- `cancela` — aborta sem write
```

- [ ] **Step 4: Add line to "Tools que você usa" / "Limites" / "Tasks automáticos" sections as needed**

Find each of these sections and add the relevant entry:

In "Tools que você usa" section, add bullet:
- `Bash(finance-csv:*)` — CLI no container pra parse/reconcile/classify de CSVs de extrato (BTG/Inter/Hotmart). Veja `container/skills/finance-csv/SKILL.md` pro reference completo.

In "Limites" section, add bullet:
- O fluxo de CSV **nunca auto-grava**. Sempre passa por card de confirmação batch — mesmo as linhas de alta confiança do cache.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/add-finance/system-prompt.md
git commit -m "feat(add-finance): add processar_extrato intent and workflow"
```

---

## Task 15: Wire CSV documents from Telegram to imports/inbox/

**Files:**
- Investigate first; modify file(s) found in Step 1.

- [ ] **Step 1: Investigate current Telegram document handling**

Run:
```bash
grep -rn "document\|csv\|attachment" node_modules/@chat-adapter/telegram/dist 2>/dev/null | head -30
```

Then:
```bash
grep -rn "localPath\|attachment\|saveToFile\|download" src/channels/telegram.ts src/channels/whatsapp.ts | head -40
```

Document the findings:
- Does the Telegram adapter already download documents? If yes, where to?
- What's set on the `attachment` object when it surfaces in the inbound message?
- Is there a hook to redirect doc downloads to `groups/<folder>/imports/inbox/`?

- [ ] **Step 2: Decide and document the plumbing change**

Based on Step 1's findings, the change is one of:

A) **Adapter already saves; we just need to redirect path.** Likely a config option on `createTelegramAdapter({ attachmentsDir })`. Add per-group resolution that maps to `groups/<folder>/imports/inbox/`.

B) **Adapter exposes bytes; we save in our channel wrapper.** In `src/channels/telegram.ts`, on inbound message with `attachments[].type === 'document'` and name ending in `.csv` (or mime `text/csv`):
   - Resolve the group folder path
   - Save bytes to `<group>/imports/inbox/<sanitized-filename>`
   - Set `attachment.localPath` to `agent/imports/inbox/<sanitized-filename>` (path relative to `/workspace/` because formatter.ts prepends `/workspace/`)

C) **Adapter drops bytes entirely; need to hook earlier.** Adapter-level patch or upgrade required.

Write the decision in a comment in `src/channels/telegram.ts` near where the change will go.

- [ ] **Step 3: If (A) — wire the config**

In `src/channels/telegram.ts`, in `createTelegramAdapter` setup, add an attachment-dir resolver. Match the existing pattern for per-group state.

Apply the smallest viable change. Show file + line numbers in commit message.

- [ ] **Step 4: If (B) — implement the save hook**

In `src/channels/telegram.ts`, find where inbound messages are processed and attachments are extracted. Add (or extend) code that:

```typescript
// At message-processing time, after attachments are extracted:
import { resolveGroupFolderPath } from '../v1/group-folder.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';

function maybeSaveCsvAttachment(att: any, groupFolder: string): void {
  const name = att.name ?? att.filename ?? '';
  const mime = att.mimeType ?? '';
  const isCsv = mime === 'text/csv' || /\.csv$/iu.test(name);
  if (!isCsv) return;
  if (typeof att.data !== 'string' || att.data.length === 0) return;

  const safe = basename(name).replace(/[^\w.\-]/gu, '_');
  const inbox = join(resolveGroupFolderPath(groupFolder), 'imports', 'inbox');
  mkdirSync(inbox, { recursive: true });
  const outPath = join(inbox, safe);
  writeFileSync(outPath, Buffer.from(att.data, 'base64'));
  // Container sees /workspace/agent/imports/inbox/<safe>;
  // formatter prepends /workspace/ to localPath
  att.localPath = `agent/imports/inbox/${safe}`;
}
```

Call `maybeSaveCsvAttachment` for each non-image attachment in the inbound processing path. Pass the resolved group folder (already known by the channel handler at that point).

- [ ] **Step 5: If (C) — escalate**

Report blocker: "Telegram adapter at `@chat-adapter/telegram@<version>` drops document bytes; cannot save without adapter upgrade or fork. Defer Task 15 until upstream support arrives; user can manually drop CSVs into `groups/finance/imports/inbox/` and trigger via chat in the meantime."

- [ ] **Step 6: Build and verify wiring**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/channels/telegram.ts
git commit -m "feat(telegram): route CSV document uploads to <group>/imports/inbox/"
```

---

## Task 16: Manual end-to-end smoke test

**Files:** none — this is verification.

- [ ] **Step 1: Restart NanoClaw**

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw || systemctl --user restart nanoclaw
```

Wait ~5s for service.

- [ ] **Step 2: Drop a CSV directly into inbox (bypass Telegram for the first test)**

```bash
cp container/skills/finance-csv/__tests__/fixtures/btg-sample.csv \
   groups/finance/imports/inbox/test-import.csv
```

- [ ] **Step 3: Trigger the agent via Telegram**

Send to Levis on Telegram: "processa o csv em imports/inbox/test-import.csv"

Watch for:
- Levis runs `finance-csv parse` (visible in logs or via Bash trace if enabled)
- Levis calls Composio BATCH_GET (visible in any Composio activity logs)
- Levis renders the summary card

- [ ] **Step 4: Confirm in the card**

Reply "confirma".

Verify in the Google Sheet:
- New rows in `Lançamentos-PF`
- `Recorrentes` matched items have `pago_no_mes=TRUE`
- `Recebíveis` matched items have `status='recebido'`

Verify on disk:
- CSV moved to `groups/finance/imports/processed/test-import.csv`
- New `groups/finance/imports/processed/test-import.csv.summary.json` exists
- `groups/finance/classification-cache.json` has new patterns from this import

- [ ] **Step 5: Re-import test (idempotency)**

```bash
cp container/skills/finance-csv/__tests__/fixtures/btg-sample.csv \
   groups/finance/imports/inbox/test-import-again.csv
```

Send: "processa o csv em imports/inbox/test-import-again.csv"

Expected: summary card shows **all lines as `matched` or `skipped_reimport`** — zero `to_add`. No duplicates in the sheet.

- [ ] **Step 6: Telegram attachment test (if Task 15 wired)**

Drag-and-drop the `btg-sample.csv` into the Levis Telegram chat. Send no extra text.

Expected: Levis recognizes the attachment, runs the workflow, presents the card. Same outcome as Step 3–4.

If Task 15 was deferred (option C): skip this step; document in commit / PR that Telegram-attachment ingestion is pending.

- [ ] **Step 7: Document any issues, then commit any fixes**

If everything works, no commit needed. If anything failed:
- Fix the underlying issue
- Re-test
- Commit with `fix(...)` prefix per the convention

---

## Self-Review

I checked the plan against the spec:

**Spec coverage:**
- Components (container skill, group folder, system-prompt changes) → Tasks 1–14
- Canonical schema → enforced by parser tests (Tasks 4–6)
- Reconciliation algorithm (7 buckets) → Task 9 tests every bucket
- Classification cache (lookup ordering + seeding) → Tasks 8, 12
- Summary card UX → Task 14 (system-prompt section)
- Write phase ordering → Task 14 workflow steps
- Edge cases (estorno, transferência interna, re-import, unknown bank, empty CSV) → covered in Tasks 4, 9, 10
- Error handling → exit codes documented in Task 1 SKILL.md, surfaced by CLI (Task 10), handled in workflow (Task 14)
- Telegram delivery → Task 15 (with research-first step accommodating uncertainty about adapter internals)
- End-to-end manual test → Task 16

**Placeholder scan:** No "TBD" / "TODO" / vague handwaves in the steps. Each step has either exact code, exact commands, or a concrete decision-point with explicit branching (Task 15 Step 2).

**Type consistency:** Spot-check between tasks:
- `tokenSetRatio` (Task 2) used by `matchRecorrente` and `matchEstorno` (Task 9) — same signature
- `normalizeDescricao` (Task 3) used by `classify` (Task 8) — same signature
- `classify` signature (Task 8: `(desc, cache) → result | null`) matches its use in `reconcile` (Task 9)
- `linha_id` format across parsers (Tasks 4–6): all `{bank}-yyyy-mm-dd-NNN` with zero-padded sequence
- Detection function name `detectBank` consistent in Tasks 7 and 10
- CLI subcommand names (`parse`, `classify`, `reconcile`) consistent across SKILL.md (Task 1), cli.mjs (Task 10), and system-prompt workflow (Task 14)

**Scope check:** This is one cohesive feature; no decomposition needed. Tasks build incrementally and each leaves the tree in a green state (tests pass after every commit).
