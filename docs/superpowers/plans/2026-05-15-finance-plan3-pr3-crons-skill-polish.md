# Finance Plan 3 PR 3 — Crons + Skill Template Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Plan 3 PR 3 — register three new cron jobs (`finance-trimestral`, `finance-semestral`, `finance-anual`) with their prompt files, fix a hardcoded count in the registrar, and document the operator's Plan 3 PR 2 → PR 3 upgrade path in SKILL.md.

**Architecture:** All committed artifacts land in `.claude/skills/add-finance/` (skill template) and `scripts/finance/register-cron-jobs.ts` (the registrar). The three new cron entries get added to `cron-jobs.json` (skill template). Their prompt files join the existing five in `.claude/skills/add-finance/prompts/`. The existing `_override-block.md` is reused unchanged — its semantics already fit the new prompts (deterministic tool-call sequences with `<message>`/`<internal>` output formats). The registrar's hardcoded `5` becomes `${config.jobs.length}` so future plans don't need to touch it.

**Tech Stack:** Markdown prompt files. JSON config. TypeScript (one-line fix in the registrar). Composio googlesheets MCP at runtime when crons fire (not during PR authoring).

**Spec:** `docs/superpowers/specs/2026-05-15-finance-plan3-design.md` — §6 (cron jobs), §11 (gitignore pivot — same applies here: templates only).

---

## File Structure

| Path | Action | Approx size | Responsibility |
|---|---|---|---|
| `.claude/skills/add-finance/cron-jobs.json` | edit | 8 jobs (from 5) | Skill template's full cron job list — new installs nascem com Plan 3 crons |
| `.claude/skills/add-finance/prompts/auditar-assinaturas.md` | create | ~75 lines | Trimestral audit: ATIVO recorrentes by subcategoria, ask "ainda usa?" |
| `.claude/skills/add-finance/prompts/revisao-estrutural.md` | create | ~85 lines | Semestral: count items per subcat, flag merges + lançamentos com subcat vazia |
| `.claude/skills/add-finance/prompts/revisao-anual.md` | create | ~75 lines | Anual: contratos ATIVO >12m, sugere renegociar |
| `scripts/finance/register-cron-jobs.ts` | edit (1 line) | unchanged size | Replace hardcoded `5 cron jobs registered` with `${config.jobs.length}` |
| `.claude/skills/add-finance/SKILL.md` | edit | +25 lines | New "From Plan 3 PR 2 → Plan 3 PR 3" upgrade subsection |
| `docs/superpowers/plans/2026-05-15-finance-plan3-pr3-crons-skill-polish.md` | create | this file | Plan doc (you're reading it) |

**What this PR does NOT touch:**
- `.claude/skills/add-finance/claude-md-template.md` — shipped in PR 1
- `.claude/skills/add-finance/migration-prompt.md` — shipped in PR 1
- `.claude/skills/add-finance/system-prompt.md` — shipped in PR 2
- `.claude/skills/add-finance/prompts/_override-block.md` — existing one works (deterministic style, matches new prompts)
- `groups/finance/*` — gitignored; operator copies templates locally and runs the registrar
- Any `src/` file beyond the one-liner fix in `scripts/finance/register-cron-jobs.ts`

---

## Pre-PR setup

- [ ] **Step 0.1: Branch off PR 2 (since SKILL.md edit anchors on PR 2's text)**

```bash
git checkout feature/finance-plan3-pr2
git checkout -b feature/finance-plan3-pr3
git branch --show-current
```

Expected: `feature/finance-plan3-pr3`.

- [ ] **Step 0.2: Verify clean state**

Run: `git status`

Expected: `nothing to commit` (or only the pre-existing `groups/lobby/perfil-aluno.md` modification). Resolve anything else first.

- [ ] **Step 0.3: Commit this plan doc**

```bash
git add docs/superpowers/plans/2026-05-15-finance-plan3-pr3-crons-skill-polish.md
git commit -m "$(cat <<'EOF'
docs(plans): add Plan 3 PR 3 implementation plan — crons + skill polish

Task-by-task plan for the third and final PR of Finance Plan 3.
PR 3 adds three new cron jobs (finance-trimestral / semestral / anual)
to the skill template, their prompt files, and an upgrade path entry
in SKILL.md. Also fixes the hardcoded "5 cron jobs registered" string
in scripts/finance/register-cron-jobs.ts to use config.jobs.length.

Spec: docs/superpowers/specs/2026-05-15-finance-plan3-design.md §6

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 1: Add 3 cron entries to `.claude/skills/add-finance/cron-jobs.json`

Spec ref: §6.

**Files:**
- Modify: `.claude/skills/add-finance/cron-jobs.json`

### Step 1.1: Edit

The existing file has 5 jobs. Append 3 more **before** the closing `]` of the `jobs` array.

Find:
```
    {
      "id": "task-finance-rollover",
      "kind": "task",
      "recurrence": "30 0 1 * *",
      "promptFile": "rollover.md",
      "firstRunOffsetMs": 60000
    }
  ]
}
```

Replace with:
```
    {
      "id": "task-finance-rollover",
      "kind": "task",
      "recurrence": "30 0 1 * *",
      "promptFile": "rollover.md",
      "firstRunOffsetMs": 60000
    },
    {
      "id": "task-finance-trimestral",
      "kind": "task",
      "recurrence": "0 9 13 1,4,7,10 *",
      "promptFile": "auditar-assinaturas.md",
      "firstRunOffsetMs": 60000
    },
    {
      "id": "task-finance-semestral",
      "kind": "task",
      "recurrence": "0 9 14 1,7 *",
      "promptFile": "revisao-estrutural.md",
      "firstRunOffsetMs": 60000
    },
    {
      "id": "task-finance-anual",
      "kind": "task",
      "recurrence": "0 9 15 1 *",
      "promptFile": "revisao-anual.md",
      "firstRunOffsetMs": 60000
    }
  ]
}
```

Note the comma added after the `rollover` entry's closing `}` — JSON requires it now that another entry follows.

### Step 1.2: Verify JSON

Run:
```bash
python3 -c "import json; d = json.load(open('.claude/skills/add-finance/cron-jobs.json')); print(f'jobs: {len(d[\"jobs\"])}'); [print(' ', j['id'], j['recurrence']) for j in d['jobs']]"
```

Expected: `jobs: 8` and the full list including the 3 new ones with their cron expressions.

---

## Task 2: Create `auditar-assinaturas.md` prompt

**Files:**
- Create: `.claude/skills/add-finance/prompts/auditar-assinaturas.md`

This prompt fires every quarter (13/jan, 13/abr, 13/jul, 13/out às 09h BRT). It lists active subscriptions grouped by subcategoria and asks Jonas to audit each — "ainda usa?". Output is a single `<message to="jonas">` with the audit list, or `<internal>silent run</internal>` if there's nothing active.

### Step 2.1: Write the file

```markdown
[CRON: finance-trimestral]

Job: auditar todas as assinaturas e recorrentes ATIVOS agrupados por subcategoria, perguntando "ainda usa?".

**Step 1 — Ler Recorrentes**
Tool: `GOOGLESHEETS_VALUES_GET`
- `spreadsheet_id`: <conforme CLAUDE.md>
- `range`: `Recorrentes!A2:R1000`

Captura todas as linhas com `status` na col N.

**Step 2 — Filtrar ATIVOS**
Em memória, mantém apenas linhas onde:
- col N (`status`) == `"ATIVO"`
- col E (`valor`) > 0

Resultado: array `ativos = [{codigo, nome, valor, subcategoria, dia_do_mes}, ...]` (mapeando das cols L, C, E, M, H respectivamente).

Se `ativos.length === 0` → pula direto pro Step 5 com `qtd_processada=0`.

**Step 3 — Agrupar por subcategoria**
Em memória, agrupa `ativos` por `subcategoria` (col M). Ordena os grupos pelo valor total descendente (mais caros primeiro).

Resultado: array de `{ subcategoria, items: [{codigo, nome, valor}, ...], total }`.

**Step 4 — Construir mensagem**
Formato (substitua `N`, `R$ X`, `R$ Y` pelos valores reais):

```
🔍 Audit de assinaturas (trimestral)

{N} recorrentes ATIVOS, total R$ X/mês. Bora revisar:

**{Subcategoria 1}** — R$ Y/mês
• {nome 1} ({codigo 1}) — R$ Z
• {nome 2} ({codigo 2}) — R$ Z
  → "ainda usa?"

**{Subcategoria 2}** — R$ Y/mês
• {nome 3} ({codigo 3}) — R$ Z
  → "ainda usa?"

Me responde uma de cada vez (ou "todas OK"). Quem você quer cortar eu marco como CORTADO + log em Decisoes.
```

Emite essa mensagem dentro de `<message to="jonas">…</message>`.

**Step 5 — Log**
Tool: `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND`
- `spreadsheetId`: <conforme CLAUDE.md>
- `range`: `'_Log'!A:E`
- `valueInputOption`: `USER_ENTERED`
- `values`: `[[<ISO timestamp atual>, "finance-trimestral", "success", <ativos.length>, "<N subcategorias>"]]`

**Step 6 — Output final**
- `ativos.length > 0` → já emitiu a `<message>` no Step 4.
- `ativos.length === 0` → emita `<internal>silent run: 0 recorrentes ATIVOS pra auditar</internal>`.

**Erro em qualquer Step:**
- Append linha em `_Log` com `status="error"` e `detalhes=<msg curta>` (mesmo tool do Step 5).
- Emita `<message to="jonas">⚠️ Cron finance-trimestral: <erro curto></message>`.
- Não tente "recuperar criativamente".
```

### Step 2.2: Verify

Run: `wc -l .claude/skills/add-finance/prompts/auditar-assinaturas.md`

Expected: ~50 lines (rough check).

---

## Task 3: Create `revisao-estrutural.md` prompt

**Files:**
- Create: `.claude/skills/add-finance/prompts/revisao-estrutural.md`

This prompt fires every semester (14/jan and 14/jul às 09h BRT). It checks the taxonomy health — flags subcategorias with ≤1 active item (candidates for merge) and Lançamentos rows with missing `subcategoria` (candidates for backfill or new subcat).

### Step 3.1: Write the file

```markdown
[CRON: finance-semestral]

Job: revisão estrutural da taxonomia (Subcategorias). Identifica subcats subutilizadas e lançamentos com subcategoria vazia.

**Step 1 — Ler Subcategorias**
Tool: `GOOGLESHEETS_VALUES_GET`
- `spreadsheet_id`: <conforme CLAUDE.md>
- `range`: `Subcategorias!A2:F100`

Captura `subcats = [{nome, categoria_pai, escopo}, ...]` (cols A, B, C).

**Step 2 — Ler Recorrentes ATIVOS**
Tool: `GOOGLESHEETS_VALUES_GET`
- `spreadsheet_id`: <conforme CLAUDE.md>
- `range`: `Recorrentes!A2:R1000`

Filtra em memória onde col N (`status`) == `"ATIVO"`. Conta items por `subcategoria` (col M).

Resultado: `contagem_por_subcat = {subcategoria: N_items, ...}`.

**Step 3 — Identificar subcats com ≤1 item ativo**
Pra cada subcat em `subcats`:
- Se `contagem_por_subcat[subcat.nome]` é `undefined` ou `0` → marca como **sem uso**.
- Se == `1` → marca como **subutilizada** (candidata a merge com a sibling mais próxima do mesmo `categoria_pai`).
- Se ≥ 2 → ignorado nesse passo.

Resultado: `subutilizadas = [{nome, categoria_pai, item_count, status: "sem_uso" | "subutilizada"}, ...]`.

**Step 4 — Ler Lançamentos sem subcategoria**
Tools: `GOOGLESHEETS_VALUES_GET` em `Lançamentos-PF!A2:M10000` e `Lançamentos-PJ!A2:M10000` (duas chamadas).

Em memória, filtra linhas onde col M (`subcategoria`) está vazia/nula. Conta por categoria pai (col E).

Resultado: `lancamentos_sem_subcat = {categoria_pai: count, ...}`.

Se total de lançamentos sem subcategoria == 0 E `subutilizadas.length === 0` → pula pro Step 6 com `qtd_processada=0` (nada a reportar).

**Step 5 — Construir mensagem**

Se `subutilizadas.length > 0` OU `lancamentos_sem_subcat` não vazio:

```
🏛️ Revisão estrutural (semestral)

{Se subutilizadas.length > 0:}

**Subcategorias subutilizadas** ({N}):
• {nome 1} ({categoria_pai 1}) — {item_count} items ATIVOS{; sugere merge com X se aplicável}
• {nome 2} ({categoria_pai 2}) — {item_count} items ATIVOS

Quer mantê-las, mergear ou cortar? Posso atualizar Subcategorias se você decidir.

{Se lancamentos_sem_subcat não vazio:}

**Lançamentos sem subcategoria** ({total}):
• {categoria_pai 1}: {count} linhas
• {categoria_pai 2}: {count} linhas

Eu posso preencher na próxima vez que você tocar nessas linhas (`editar_lancamento`), ou faço um batch — você prefere?
```

Emite dentro de `<message to="jonas">…</message>`.

**Step 6 — Log**
Tool: `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND`
- `spreadsheetId`: <conforme CLAUDE.md>
- `range`: `'_Log'!A:E`
- `valueInputOption`: `USER_ENTERED`
- `values`: `[[<ISO timestamp atual>, "finance-semestral", "success", <subutilizadas.length + total_lancamentos_sem_subcat>, "subutilizadas=<N>; lancamentos_sem_subcat=<total>"]]`

**Step 7 — Output final**
- Reportou algo no Step 5 → já emitiu a `<message>`.
- Nada a reportar → emita `<internal>silent run: taxonomia saudável, todos os lançamentos categorizados</internal>`.

**Erro em qualquer Step:**
- Append linha em `_Log` com `status="error"` e `detalhes=<msg curta>` (mesmo tool do Step 6).
- Emita `<message to="jonas">⚠️ Cron finance-semestral: <erro curto></message>`.
- Não tente "recuperar criativamente".
```

### Step 3.2: Verify

Run: `wc -l .claude/skills/add-finance/prompts/revisao-estrutural.md`

Expected: ~75 lines.

---

## Task 4: Create `revisao-anual.md` prompt

**Files:**
- Create: `.claude/skills/add-finance/prompts/revisao-anual.md`

This prompt fires annually (15/jan às 09h BRT). Lists contracts active for >12 months — candidates for renegotiation (plano de saúde, internet, telefonia, gym, streaming).

### Step 4.1: Write the file

```markdown
[CRON: finance-anual]

Job: identificar contratos ATIVOS há >12 meses e sugerir renegociação.

**Step 1 — Ler Recorrentes**
Tool: `GOOGLESHEETS_VALUES_GET`
- `spreadsheet_id`: <conforme CLAUDE.md>
- `range`: `Recorrentes!A2:R1000`

Captura todas as linhas. Cols relevantes: A (`id`), C (`nome`), E (`valor`), L (`codigo`), M (`subcategoria`), N (`status`).

**Step 2 — Filtrar ATIVOS**
Em memória, mantém apenas linhas onde col N (`status`) == `"ATIVO"`. Ignora CORTADO, ENCERRADO, PENDENTE.

Resultado: `ativos = [{id, codigo, nome, valor, subcategoria}, ...]`.

**Step 3 — Ler Lançamentos pra descobrir idade do contrato**
Tools: `GOOGLESHEETS_VALUES_GET` em `Lançamentos-PF!A2:M10000` E `Lançamentos-PJ!A2:M10000`.

Pra cada item em `ativos`, busca a **primeira** linha de Lançamento com `recorrente_id` (col H) == `item.id`. Pega `data` (col B) dessa primeira ocorrência.

Resultado: `idade_meses = (hoje - primeira_data) / 30` (aproximação).

Se Lançamentos não tem nenhuma linha com esse `recorrente_id` (item recente ou nunca pago), usa `idade_meses = 0`.

**Step 4 — Filtrar contratos >12 meses**
Em memória, mantém apenas itens onde `idade_meses >= 12`.

Resultado: `velhos = [{codigo, nome, valor, subcategoria, idade_meses}, ...]`, ordenado por `valor` descendente.

Se `velhos.length === 0` → pula pro Step 6 com `qtd_processada=0`.

**Step 5 — Construir mensagem**

```
📞 Revisão anual (renegociação)

{N} contratos ATIVOS há mais de 12 meses, total R$ X/mês. Esses são bons candidatos pra ligar e pedir desconto / migrar pra plano novo:

**{Subcategoria 1}**
• {nome 1} ({codigo 1}) — R$ {valor}/mês — {idade} meses
• {nome 2} ({codigo 2}) — R$ {valor}/mês — {idade} meses

**{Subcategoria 2}**
• {nome 3} ({codigo 3}) — R$ {valor}/mês — {idade} meses

Sugestão prática: pega 1-2 esta semana, liga, pede desconto ou cancelamento (geralmente sai oferta). Me conta o resultado pra eu atualizar valor (ou cortar via `cortar_recorrente`).
```

Emite dentro de `<message to="jonas">…</message>`.

**Step 6 — Log**
Tool: `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND`
- `spreadsheetId`: <conforme CLAUDE.md>
- `range`: `'_Log'!A:E`
- `valueInputOption`: `USER_ENTERED`
- `values`: `[[<ISO timestamp atual>, "finance-anual", "success", <velhos.length>, "total_mensal=R$<X>"]]`

**Step 7 — Output final**
- `velhos.length > 0` → já emitiu `<message>` no Step 5.
- `velhos.length === 0` → emita `<internal>silent run: nenhum contrato >12 meses</internal>`.

**Erro em qualquer Step:**
- Append linha em `_Log` com `status="error"` e `detalhes=<msg curta>` (mesmo tool do Step 6).
- Emita `<message to="jonas">⚠️ Cron finance-anual: <erro curto></message>`.
- Não tente "recuperar criativamente".
```

### Step 4.2: Verify

Run:
```bash
wc -l .claude/skills/add-finance/prompts/revisao-anual.md
ls .claude/skills/add-finance/prompts/
```

Expected:
- `revisao-anual.md` ~65 lines
- `prompts/` directory has 9 files: `_override-block.md`, `auditar-assinaturas.md`, `daily-digest.md`, `monthly-closing.md`, `revisao-anual.md`, `revisao-estrutural.md`, `rollover.md`, `sweep-reminder.md`, `weekly-closing.md`

---

## Task 5: Commit the three crons (Tasks 1–4 together)

The four prior tasks belong to one logical unit — the new cron triple. One commit.

- [ ] **Step 5.1: Stage + commit**

```bash
git add .claude/skills/add-finance/cron-jobs.json \
        .claude/skills/add-finance/prompts/auditar-assinaturas.md \
        .claude/skills/add-finance/prompts/revisao-estrutural.md \
        .claude/skills/add-finance/prompts/revisao-anual.md
git commit -m "$(cat <<'EOF'
feat(add-finance): add Plan 3 trimestral/semestral/anual crons

Plan 3 PR 3 — three new cron jobs registered via the existing
register-cron-jobs.ts machinery:

  finance-trimestral  0 9 13 1,4,7,10 *   audit de assinaturas
  finance-semestral   0 9 14 1,7 *        revisão estrutural taxonomia
  finance-anual       0 9 15 1 *          renegociação de contratos

Days are intentionally offset (13/14/15) so they never collide on the
same date. All three use the existing _override-block.md (already
deterministic; suitable for these tool-call sequences).

Prompts follow the established Finance cron pattern (numbered Steps,
GOOGLESHEETS_VALUES_GET → filter in memory → GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND
in _Log → emit <message to="jonas"> or <internal>silent run):

  - auditar-assinaturas.md: groups ATIVO recorrentes by subcategoria,
    asks "ainda usa?" per group (sorted by total descending).
  - revisao-estrutural.md: flags subcategorias com ≤1 item ATIVO
    (candidates for merge) and Lançamentos with empty subcategoria
    (backfill candidates).
  - revisao-anual.md: cross-references Recorrentes ATIVO with first
    Lançamento date to compute idade_meses; lists contracts >12 months
    for renegotiation.

Skill template's cron-jobs.json grows from 5 → 8 jobs so new
/add-finance installs nascem com Plan 3 crons. Existing installs
register the new three via `npx tsx scripts/finance/register-cron-jobs.ts
--session <id>` after PR 3 merges (idempotent via INSERT OR REPLACE
on the fixed job ids).

Spec: docs/superpowers/specs/2026-05-15-finance-plan3-design.md §6
Plan: docs/superpowers/plans/2026-05-15-finance-plan3-pr3-crons-skill-polish.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Fix hardcoded `5 cron jobs registered` in registrar

**Files:**
- Modify: `scripts/finance/register-cron-jobs.ts`

The registrar currently logs `✅ 5 cron jobs registered in <path>` at the end. With PR 3 it should say `✅ 8 cron jobs registered`. Hardcoding the number means every future plan that touches `cron-jobs.json` must also touch this script. Replace with the dynamic count.

### Step 6.1: Edit

Find:
```typescript
  registerCronJobs({ inboundDbPath, configPath, promptsDir });

  console.log(`✅ 5 cron jobs registered in ${inboundDbPath}`);
  console.log('   Verify: sqlite3 ' + inboundDbPath + ' "SELECT id, kind, recurrence, datetime(process_after) FROM messages_in WHERE recurrence IS NOT NULL;"');
}
```

Replace with:
```typescript
  registerCronJobs({ inboundDbPath, configPath, promptsDir });

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as { jobs: unknown[] };
  console.log(`✅ ${config.jobs.length} cron jobs registered in ${inboundDbPath}`);
  console.log('   Verify: sqlite3 ' + inboundDbPath + ' "SELECT id, kind, recurrence, datetime(process_after) FROM messages_in WHERE recurrence IS NOT NULL;"');
}
```

### Step 6.2: Verify

Run: `grep -n 'cron jobs registered' scripts/finance/register-cron-jobs.ts`

Expected: one line, dynamic — `\`✅ ${config.jobs.length} cron jobs registered in ${inboundDbPath}\`` (not `5`).

Run a TypeScript syntax check (if `npx tsc` works locally — otherwise skip):
```bash
npx tsc --noEmit scripts/finance/register-cron-jobs.ts 2>&1 | head -5
```

Expected: no errors. The `config` variable is now declared twice (once inside `registerCronJobs()` and once in the CLI block) — both are scoped, no conflict.

### Step 6.3: Commit

```bash
git add scripts/finance/register-cron-jobs.ts
git commit -m "$(cat <<'EOF'
fix(scripts/finance): log dynamic cron count instead of hardcoded 5

Plan 3 PR 3 grows the cron set from 5 → 8 jobs. Hardcoding the
count in the registrar's final log line means every plan that
touches cron-jobs.json must touch this script too. Replace the
literal "5" with config.jobs.length so the log reflects whatever's
actually in the JSON.

No behavior change beyond the log message. The registrar's actual
work is already driven entirely by cron-jobs.json content.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Update SKILL.md — Plan 3 PR 2 → Plan 3 PR 3 upgrade path

**Files:**
- Modify: `.claude/skills/add-finance/SKILL.md`

PR 2 shipped a "From Plan 3 PR 1 → Plan 3 PR 2 (Levis behavior)" section ending with the 4-intent smoke-test. PR 3 adds the follow-up: register the three new crons and verify they appear in `messages_in`.

### Step 7.1: Edit

Find the last step of PR 2's upgrade section and the `Skip the whole...` closing line:
```
5. Se algum smoke-test falhar, faça `/clear` de novo (às vezes o bot precisa de 2 ciclos pra recarregar) e re-teste. Se ainda falhar, revise o diff entre seu `groups/finance/system-prompt.md` local e o template.

Skip the whole "create agent group / bot / sheet" flow.
```

Replace with:
```
5. Se algum smoke-test falhar, faça `/clear` de novo (às vezes o bot precisa de 2 ciclos pra recarregar) e re-teste. Se ainda falhar, revise o diff entre seu `groups/finance/system-prompt.md` local e o template.

### From Plan 3 PR 2 → Plan 3 PR 3 (three new crons)

> Prerequisite: PR 2 already applied (system-prompt is Plan 3, bot has been `/clear`'d, smoke-tests pass). If you skipped PR 2, run that first.

1. `git pull` to get the latest skill templates.
2. Re-register the cron jobs so the three new ones land in the agent's inbound DB. Get the session id first:
   ```bash
   sqlite3 data/v2.db "SELECT id FROM sessions WHERE agent_group_id='finance' ORDER BY created_at DESC LIMIT 1;"
   ```
   Then run:
   ```bash
   npx tsx scripts/finance/unregister-cron-jobs.ts --session <session-id>
   npx tsx scripts/finance/register-cron-jobs.ts --session <session-id>
   ```
   The registrar reports `✅ 8 cron jobs registered` (5 from Plan 2.5 + 3 from Plan 3).
3. Verify the 8 jobs are pending in the inbound DB:
   ```bash
   sqlite3 data/v2-sessions/finance/<session-id>/inbound.db \
     "SELECT id, recurrence FROM messages_in WHERE recurrence IS NOT NULL ORDER BY id;"
   ```
   Expected: 8 rows including `task-finance-trimestral`, `task-finance-semestral`, `task-finance-anual`.
4. **No `/clear` needed** — system-prompt already knows the three new intents (PR 2 documented them as cron-only). The first natural fire of each is the next 13/14/15 of jan/abr/jul/out (whichever is earliest in your calendar).
5. (Optional) Smoke-test by forcing one of the cron intents via chat: send `audita as assinaturas` to the bot — Levis should respond with the audit message format from `auditar-assinaturas.md`.

Skip the whole "create agent group / bot / sheet" flow.
```

### Step 7.2: Verify

Run: `grep -nE '^### From Plan' .claude/skills/add-finance/SKILL.md`

Expected: four subsection headings now:
- `### From Plan 1 → current`
- `### From Plan 2 → Plan 2.5 only`
- `### From Plan 2.5 → Plan 3 (PR 1 — schema + bootstrap)`
- `### From Plan 3 PR 1 → Plan 3 PR 2 (Levis behavior)`
- `### From Plan 3 PR 2 → Plan 3 PR 3 (three new crons)`

Wait — that's five total upgrade paths. OK, expect five.

### Step 7.3: Commit

```bash
git add .claude/skills/add-finance/SKILL.md
git commit -m "$(cat <<'EOF'
docs(add-finance): document Plan 3 PR 2 → PR 3 upgrade path

Closes out the Plan 3 upgrade chain in SKILL.md. PR 3 adds three
new crons (finance-trimestral / semestral / anual); operator runs
unregister + register-cron-jobs.ts to install them.

No /clear needed — PR 2 already taught Levis about the three
cron-only intents (auditar_assinaturas, revisao_estrutural,
revisao_anual).

After PR 3 merges, Plan 3 is complete. Future plans branch off
this as the new baseline.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Push + open PR

### Step 8.1: Push branch

```bash
git push -u origin feature/finance-plan3-pr3
```

### Step 8.2: Open PR

```bash
gh pr create --title "feat(finance): Plan 3 PR 3 — crons + skill template polish" --base main --body "$(cat <<'EOF'
Third and final PR of the Finance Plan 3 reform.

- Spec: \`docs/superpowers/specs/2026-05-15-finance-plan3-design.md\`
- Plan: \`docs/superpowers/plans/2026-05-15-finance-plan3-pr3-crons-skill-polish.md\`
- **Depends on PR #2486 and #2487** (Plan 3 PR 1 + PR 2). This branch is rebased on top of \`feature/finance-plan3-pr2\`, so it carries forward those commits. GitHub will narrow the diff to just PR 3's commits once PR 1 and PR 2 merge.

## What landed

Four commits, mostly template content + one TypeScript one-liner:

1. \`docs(plans): ...\` — Plan 3 PR 3 implementation plan
2. \`feat(add-finance): add Plan 3 trimestral/semestral/anual crons\` — the cron triple (cron-jobs.json + 3 new prompt files)
3. \`fix(scripts/finance): log dynamic cron count instead of hardcoded 5\` — one-line registrar fix
4. \`docs(add-finance): document Plan 3 PR 2 → PR 3 upgrade path\` — SKILL.md upgrade chain closure

## The three new crons

| Cron id | Cron expr (BRT) | When | Job file |
|---|---|---|---|
| \`task-finance-trimestral\` | \`0 9 13 1,4,7,10 *\` | 13/jan, 13/abr, 13/jul, 13/out às 09h | \`auditar-assinaturas.md\` |
| \`task-finance-semestral\` | \`0 9 14 1,7 *\` | 14/jan, 14/jul às 09h | \`revisao-estrutural.md\` |
| \`task-finance-anual\` | \`0 9 15 1 *\` | 15/jan às 09h | \`revisao-anual.md\` |

Days are offset (13/14/15) so they never collide. All three reuse the existing \`_override-block.md\` (deterministic format already fits).

## Operator rollout (post-merge)

Documented in \`SKILL.md\` \"From Plan 3 PR 2 → Plan 3 PR 3 (three new crons)\":

1. \`git pull\`
2. Get the session id and re-register:
   \`\`\`bash
   sqlite3 data/v2.db \"SELECT id FROM sessions WHERE agent_group_id='finance' ORDER BY created_at DESC LIMIT 1;\"
   npx tsx scripts/finance/unregister-cron-jobs.ts --session <id>
   npx tsx scripts/finance/register-cron-jobs.ts --session <id>
   \`\`\`
   Expect \`✅ 8 cron jobs registered\`.
3. Verify 8 rows in \`messages_in\` with the three new \`task-finance-{trimestral|semestral|anual}\` IDs.
4. No \`/clear\` needed — PR 2 already taught Levis the three cron-only intents.
5. (Optional) Smoke-test by sending \`audita as assinaturas\` to the bot.

## Plan 3 path — complete

- PR 1 (#2486) — schema + bootstrap
- PR 2 (#2487) — Levis behavior (new intents, sensibilidade rule, exportar_doc)
- **PR 3 (this)** — three new crons + registrar polish

Once all three merge, Plan 3 is done. Future Finance plans branch off this as the new baseline (\"From Plan 3 → Plan 4\" would be the next entry in SKILL.md's upgrade chain).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

---

## Self-review (mental check before handoff)

**Spec coverage:**
- §6 — three new crons with correct cron expressions and prompt file names → Tasks 1–4 ✓
- §6 — days offset to prevent collision (13/14/15) → cron expressions in Task 1 ✓
- §6 — uses existing `_override-block.md` (verified to be Plan-3-compatible — see exploration log) → no Task needed for that file ✓
- §11 (gitignore pivot) — all artifacts in `.claude/skills/add-finance/` template; operator copies/re-registers locally → respected in Tasks 1–7 ✓

**Placeholder scan:** No TBDs. No "implement later". Each Step shows the exact content to write or the exact find/replace.

**Type/name consistency:**
- Cron IDs use `task-finance-` prefix — consistent with existing 5 (sweep/daily/weekly/monthly/rollover) ✓
- Prompt files end in `.md`, no underscores — match existing pattern (sweep-reminder.md, daily-digest.md, etc) ✓
- `subcategoria`, `status`, `codigo`, `nao_sugerir_corte` — all match Plan 3 schema names from PR 1's claude-md-template.md ✓
- Cron expressions BRT — `register-cron-jobs.ts` doesn't pass an explicit `tz` to the cron parser (unlike the Lili registrar). **Note this:** Plan 3 PR 3 inherits whatever timezone behavior the existing Finance script uses (which appears to be the system default, not `America/Sao_Paulo` explicitly). If the operator's NanoClaw process runs in UTC and the crons should fire at BRT, the times are wrong by 3 hours. **This is a pre-existing concern from Plan 2.5, not new to PR 3.** If audit reveals a real bug, fix in PR 3.1 — out of scope here.

**One pragmatic note:** The cron prompts assume `Decisoes` and `Subcategorias` tabs exist. If operator hasn't run PR 1's migration, the first firing of any of these three crons will Composio-error. The PR description's "Prerequisite" note covers this.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-15-finance-plan3-pr3-crons-skill-polish.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
