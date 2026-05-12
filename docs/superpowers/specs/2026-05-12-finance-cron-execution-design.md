# Finance Agent — Plan 2.5: Cron Execution Hardening

**Status:** spec (pre-plan)
**Author:** Jonas + Claude Opus 4.7
**Date:** 2026-05-12
**Predecessors:** [Plan 1](../plans/2026-05-11-finance-agent-plan-1-foundation.md), [Plan 2](../plans/2026-05-11-finance-agent-plan-2-automation-accounts.md)
**Trigger:** Plan 2 commit `a0925dd` deferred a "Plan 2.5 pending" — the live Levis agent treats `[CRON: …]` prompts as casual chat instead of executing them.

---

## 1. Problem statement

After Plan 2 was applied to the live finance agent (Levis), the 5 cron jobs (`finance-sweep`, `finance-daily`, `finance-weekly`, `finance-monthly`, `finance-rollover`) fire on schedule and reach the container — but the agent responds with conversational greetings ("Pode mandar!", "Tudo certo por aqui") instead of executing the cron task literally. The `_Log` sheet never receives the expected rows, no digest is sent, no reminders are swept.

Commit `a0925dd` added a "Tasks automáticos (CRON)" section to `system-prompt.md` to teach the agent how to handle `[CRON: ...]`-prefixed messages. That commit's hypothesis: the Levis persona ("registra/consulta finanças") is so strong that it overrides the new CRON rules.

This spec re-diagnoses the bug, then designs a fix.

---

## 2. Re-diagnosis

The persona-override hypothesis was made without verifying the agent actually receives the cron content. Tracing the code from `register-cron-jobs.ts` through the container's poll-loop reveals a different root cause:

1. `scripts/finance/register-cron-jobs.ts` inserts rows into `messages_in` with `kind='scheduled'` and `content` = raw markdown body of the prompt file.
2. The host-sweep wakes the container on schedule (works — verified in Plan 2).
3. The container's poll-loop (`container/agent-runner/src/poll-loop.ts`) calls `formatMessages()` from `container/agent-runner/src/formatter.ts:80`.
4. `formatMessages` filters strictly by kind: `chat | chat-sdk | task | webhook | system`. **`kind='scheduled'` matches no filter**, so the row is silently dropped from the formatted prompt.
5. `parts.join('\n\n')` returns `''` → `provider.query({ prompt: '', ... })` fires with an empty user turn.
6. Claude wakes up with only the Levis persona system-prompt and no user message. With a strong "you are Levis, finance assistant" persona and zero input, the model emits a casual greeting — exactly the observed symptom.

The "CRON handling" section added to `system-prompt.md` in commit `a0925dd` is unreachable code as long as `kind='scheduled'` is silently dropped by `formatter.ts:80-105`.

A secondary problem is then plausible (but currently unfalsifiable): even with content reaching the agent, the persona might still override execution. The fix below addresses both — first by getting content to the agent, then by reinforcing non-interactive execution in two independent ways.

---

## 3. Goal

Make the 5 cron jobs execute their procedural instructions literally, write to `_Log`, and either send useful output via `<message to="jonas">…</message>` or stay silent via `<internal>silent run: …</internal>`. No casual responses. No confirmation cards.

Stay finance-only — do not touch shared code in `container/agent-runner/`, `src/host-sweep.ts`, or the formatter. The generic `kind='scheduled'` silent-drop bug is documented for a future plan, not fixed here.

---

## 4. Architecture

Three independent layers of defense, all isolated to `.claude/skills/add-finance/` and `scripts/finance/`:

### Layer 1 — Transport fix

`scripts/finance/register-cron-jobs.ts` is modified to insert rows with:
- `kind='task'` (instead of `'scheduled'`)
- `content = JSON.stringify({prompt: <override-block> + <procedural-prompt>})`

The container's existing `formatTaskMessage()` in `formatter.ts` renders this as:
```
[SCHEDULED TASK]

Instructions:
<override block>

<procedural prompt>
```

No container code changes. The transport bug is bypassed by piggybacking on the already-handled `kind='task'` envelope.

### Layer 2 — Override block

A fixed text block, `prompts/_override-block.md`, prefixed to every cron prompt's `prompt` field by `register-cron-jobs.ts`. It instructs the agent to ignore the Levis persona's interactive rules (no greeting, no confirmation cards, no clarifying questions) and emit exactly one of two output formats: `<message to="jonas">…</message>` or `<internal>silent run: …</internal>`. The block also specifies the `_Log` row format and error behavior.

### Layer 3 — Procedural prompts

The 5 prompts in `prompts/*.md` are rewritten in `Step N — tool call` style instead of narrative pt-br ("Faça AGORA: 1. Lê…"). Each step names an exact Composio tool slug, parameters, and the condition for skipping ahead. Removes the conversational vocabulary that triggers persona responses.

### Defense-in-depth rationale

If layer 1 succeeds and the model follows layer 2/3, cron runs correctly. If layer 2 is partially ignored (model still tries to act conversationally), layer 3's explicit tool-call sequence still leads it to the correct calls. If both 2 and 3 fail, the `_Log` row is missing — observable failure mode, easy to diagnose.

---

## 5. Components

### Files modified

| File | Change |
|---|---|
| `scripts/finance/register-cron-jobs.ts` | Read `prompts/_override-block.md`, prefix each prompt with it, write JSON `{prompt:…}` content with `kind='task'`. Add inline TODO comment pointing to `container/agent-runner/src/formatter.ts:80-105` documenting the generic silent-drop of `kind='scheduled'` (out of scope here). |
| `scripts/finance/__tests__/register-cron-jobs.test.ts` | Update existing 3 tests for new format; add a 4th idempotency test. |
| `scripts/finance/unregister-cron-jobs.ts` | Verify no logic change needed (deletes by deterministic ids regardless of kind). Update comment if it references `kind='scheduled'`. |
| `.claude/skills/add-finance/cron-jobs.json` | Change `"kind": "scheduled"` → `"kind": "task"` in all 5 entries. |
| `.claude/skills/add-finance/prompts/sweep-reminder.md` | Rewrite procedural with exact tool slugs. |
| `.claude/skills/add-finance/prompts/daily-digest.md` | Idem. |
| `.claude/skills/add-finance/prompts/weekly-closing.md` | Idem. |
| `.claude/skills/add-finance/prompts/monthly-closing.md` | Idem. |
| `.claude/skills/add-finance/prompts/rollover.md` | Idem. |
| `.claude/skills/add-finance/system-prompt.md` | Fix tool-slug drift (2 occurrences): line 183 `GOOGLESHEETS_BATCH_UPDATE` → `GOOGLESHEETS_UPDATE_VALUES_BATCH`; line 241 `GOOGLESHEETS_BATCH_CLEAR_VALUES_BY_DATA_FILTER` → `GOOGLESHEETS_CLEAR_VALUES`. Keep `GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW` (line 150) — canonical. Keep the "Tasks automáticos (CRON)" section from `a0925dd` verbatim — it's now defense-in-depth (layer 2 in §4 reinforces it from the user-turn side). |
| `.claude/skills/add-finance/claude-md-template.md` | Fix tool-slug drift (4 occurrences, all in the tool list around lines 67–73): `GOOGLESHEETS_BATCH_UPDATE` → `GOOGLESHEETS_UPDATE_VALUES_BATCH`; `GOOGLESHEETS_BATCH_UPDATE_VALUES_BY_DATA_FILTER` → `GOOGLESHEETS_UPDATE_VALUES_BATCH` (same target, since DATA_FILTER variant doesn't exist in current matrix); `GOOGLESHEETS_BATCH_CLEAR_VALUES_BY_DATA_FILTER` → `GOOGLESHEETS_CLEAR_VALUES`; `GOOGLESHEETS_GET_SPREADSHEET_BY_DATA_FILTER` → `GOOGLESHEETS_VALUES_GET`. Keep `GOOGLESHEETS_INSERT_DIMENSION` and `GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW` — both canonical. |
| `.claude/skills/add-finance/SKILL.md` | Add to Step 9.5 verification: `sqlite3 … "SELECT kind FROM messages_in WHERE id LIKE 'task-finance-%';"` must return `task`. Add upgrade path note for Plan 2 → Plan 2.5: rerun `unregister-cron-jobs.ts` + `register-cron-jobs.ts`. |

### Files created

| File | Purpose |
|---|---|
| `.claude/skills/add-finance/prompts/_override-block.md` | Fixed text block prefixed to every cron prompt. ~15 lines. Content in §6 below. |

### Files NOT modified (explicitly out of scope)

- `container/agent-runner/src/formatter.ts` — generic silent-drop of `kind='scheduled'` documented via TODO comment in `register-cron-jobs.ts`; deferred to a future plan.
- `container/agent-runner/src/poll-loop.ts` — no change.
- `src/host-sweep.ts` — recurrence handler does not filter by kind. Verify during execution; no expected change.
- `src/db/session-db.ts` — `insertRecurrence` / `getCompletedRecurring` must not filter by kind. Verify during execution.

### Live runtime files (operator-touched)

- `groups/finance/CLAUDE.md` — operator mirrors from updated `claude-md-template.md` (tool slugs).
- `groups/finance/system-prompt.md` — operator mirrors from updated `system-prompt.md`.
- `groups/finance/` workbook on Google Drive — operator confirms `_Log` tab exists with headers `[timestamp, job, status, qtd_processada, detalhes]`. Plan 2 may or may not have created it; verify.

---

## 6. Concrete content

### `prompts/_override-block.md`

```markdown
[SYSTEM TASK — NON-INTERACTIVE]

Este é um cron job automatizado, não uma mensagem do Jonas. Regras de execução:

1. NÃO cumprimente. NÃO peça confirmação. NÃO pergunte esclarecimento.
2. NÃO mostre cards de confirmação. NÃO use os templates "📝 Confirma?".
3. Os princípios "Confirme antes de escrever" e "Pergunte se ambíguo" NÃO se aplicam — siga os Steps literalmente.
4. Output deve ser exatamente UM destes formatos:
   - `<message to="jonas">{conteúdo entregue ao usuário}</message>` — quando o cron produz info útil
   - `<internal>silent run: {motivo curto}</internal>` — quando não há nada pra entregar
5. SEMPRE registre 1 linha em `_Log!A:E` ao final: `[ISO timestamp, job_name, status, qtd_processada, detalhes]`.
6. Se algum Step falhar: log error em `_Log` + emita `<message to="jonas">⚠️ Cron {nome}: {erro curto}</message>` (1 frase).
7. Não tente "recuperar criativamente" — falha → log + reporta + para.

Execute os Steps abaixo na ordem. Cada Step é uma tool-call explícita ou ação determinística.

---
```

### `prompts/sweep-reminder.md` (exemplo procedural; outros 4 seguem o mesmo molde)

```markdown
[CRON: finance-sweep]

Job: enviar lembretes vencidos do Jonas.

**Step 1 — Ler Lembretes**
Tool: `GOOGLESHEETS_VALUES_GET`
- `spreadsheet_id`: <conforme CLAUDE.md>
- `range`: `Lembretes!A2:E1000`

Se a resposta for vazia → pula direto pro Step 5 com `qtd_processada=0`.

**Step 2 — Filtrar vencidos (em memória)**
Mantenha apenas linhas onde:
- col C (`quando`) ≤ datetime atual
- col E (`enviado_em`) está vazia/nula

Resultado: array `vencidos = [{row_index, mensagem, quando}, ...]`.
Se `vencidos.length === 0` → Step 5 com `qtd_processada=0`.

**Step 3 — Enviar mensagens**
Para cada item em `vencidos`, em ordem, emita exatamente:
`<message to="jonas">🔔 Lembrete: {mensagem}</message>`

**Step 4 — Marcar como enviado**
Tool: `GOOGLESHEETS_UPDATE_VALUES_BATCH`
Uma única chamada batch atualizando `E{row_index}` = ISO timestamp atual, para cada item em `vencidos`.

**Step 5 — Log**
Tool: `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND`
- `range`: `'_Log'!A:E`, `valueInputOption`: `USER_ENTERED`
- `values`: `[[<ISO timestamp atual>, "finance-sweep", "success", <vencidos.length>, ""]]`

**Step 6 — Output final**
- `vencidos.length > 0` → já emitiu N `<message>` no Step 3, não emita mais nada.
- `vencidos.length === 0` → emita `<internal>silent run: 0 lembretes vencidos</internal>`.

**Erro em qualquer Step:**
- Step 5 com `status="error"` e `detalhes=<msg curta>`
- Emita `<message to="jonas">⚠️ Cron finance-sweep: <erro curto></message>`
```

### Composio tool slugs (canonical, confirmed against active matrix)

| Operation | Slug | Used in |
|---|---|---|
| Read range | `GOOGLESHEETS_VALUES_GET` | sweep, daily, weekly, monthly, rollover |
| Batch read multiple ranges | `GOOGLESHEETS_BATCH_GET` | daily, weekly, monthly (optional optimization) |
| Update many cells | `GOOGLESHEETS_UPDATE_VALUES_BATCH` | sweep (mark enviado_em), rollover (reset pago_no_mes) |
| Append row | `GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND` | all (`_Log` write) |
| Clear range | `GOOGLESHEETS_CLEAR_VALUES` | rollover |
| Lookup by value | `GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW` | (not used in crons; used in system-prompt for idempotency) |

`_Log` is referenced with single quotes (`'_Log'!A:E`) because the tab name starts with an underscore — defensive A1 quoting matches the Composio pitfall warning.

---

## 7. Data flow

### Happy path (sweep with 0 reminders)

```
register-cron-jobs.ts (once during install)
  → INSERT messages_in row: kind='task',
    content=JSON.stringify({prompt: <override>+<sweep-procedural>}),
    process_after=<next 08:00>, recurrence='0 8-22 * * *'

host-sweep (cron tick at 08:00)
  → countDueMessages() sees task-finance-sweep
  → wakeContainer(financeSession)
  → container boots

container poll-loop
  → getPendingMessages() picks the row
  → formatMessages() → "[SCHEDULED TASK]\n\nInstructions:\n<override>\n\n<sweep-procedural>"
  → provider.query({ prompt: <text>, continuation: <levis-session> })

Claude SDK
  → system: Levis persona + CRON section (reinforcement only)
  → user: [SCHEDULED TASK] envelope + override block + procedural sweep
  → Tool: GOOGLESHEETS_VALUES_GET 'Lembretes!A2:E1000' → empty
  → Tool: GOOGLESHEETS_SPREADSHEETS_VALUES_APPEND '_Log'!A:E
          values=[[ISO, 'finance-sweep', 'success', 0, '']]
  → Final text: <internal>silent run: 0 lembretes vencidos</internal>

dispatchResultText()
  → no <message to="..."> blocks
  → scratchpad emptied (strip <internal>)
  → nothing written to messages_out

Channel adapter
  → nothing to deliver (correct silent behavior)

host-sweep handleRecurrence
  → task-finance-sweep completed
  → next() = 09:00
  → insertRecurrence() creates next pending row
```

### Happy path (sweep with N reminders)

Identical to above except:
- Step 3 emits N `<message to="jonas">🔔 Lembrete: …</message>` blocks
- Step 4 batch-updates N `enviado_em` cells
- Step 5 logs `qtd_processada=N`
- `dispatchResultText()` finds N `<message>` blocks, resolves `findByName('jonas')` → writes N rows to `messages_out`
- Channel adapter sends N Telegram messages

### Error handling layers

| Layer | Scenario | Detection | Recovery |
|---|---|---|---|
| L0 host-sweep | container didn't wake | `dueCount > 0 && !isContainerRunning()` next sweep | auto-retry next SWEEP_INTERVAL_MS |
| L1 container crash mid-run | stale heartbeat > 10min | `detectStaleContainers()` resets row to `pending` with backoff (5/10/20/40/80s) | up to 5 tries, then marked `failed` |
| L2 Composio tool error | tool call returns error | Step in override block: log to `_Log` with `status='error'` + emit `<message ⚠️>` | Jonas sees warning in Telegram; `_Log` records error |
| L3 model ignores override | no `<message>` nor `<internal>`; casual text | `dispatchResultText` falls back to single-destination → casual text delivered to Jonas; **`_Log` has no row** | Jonas sees "Pode mandar!"; operator confirms via `_Log` row missing → re-run smoke or escalate to Plan 2.6 |
| L4 `_Log` tab missing | Composio returns 400 "Unable to parse range" | same as L2 — captured, ⚠️ emitted | operator creates tab (covered by a plan step) |
| L5 mass error (`_Log` write itself fails) | last resort — model emits `<message ⚠️>` only, no `_Log` | manual diagnosis | operator debugs |

### Observability

- **`_Log` sheet** is the source of truth: 1 row per cron tick. Operator can ask Levis "lista últimas 5 do `_Log`".
- **`messages_in.status` + `processing_ack`** in SQLite — low-level debug.
- **Heartbeat file mtime** at `data/v2-sessions/finance/<session>/heartbeat` — container liveness.

---

## 8. Testing strategy

### Automated (vitest)

`scripts/finance/__tests__/register-cron-jobs.test.ts`:

| Test | Assertions |
|---|---|
| T1 — schema | 5 rows with ids `task-finance-{sweep,daily,weekly,monthly,rollover}`; `kind === 'task'`; `content` is parseable JSON; `content.prompt` non-empty string; `process_after` matches `YYYY-MM-DD HH:MM:SS`; `recurrence` matches `cron-jobs.json`. |
| T2 — override block injected | For each row, `content.prompt` starts with `[SYSTEM TASK — NON-INTERACTIVE]` and contains all 7 enumerated rules. |
| T3 — procedural prompt included | For each job, `content.prompt` includes the job-specific token (e.g. `[CRON: finance-sweep]` and `Step 1 — Ler Lembretes` for sweep). |
| T4 — idempotency (NEW) | Running `registerCronJobs()` twice → still 5 rows (not 10); `seq` values stable; second `process_after` overwrites first. |

Runs against `:memory:` SQLite, no container required.

### Smoke (manual, operator-driven)

| Scenario | Procedure | Pass criteria |
|---|---|---|
| S1 sweep silent | Operator: `UPDATE messages_in SET process_after=datetime('now','-2 minutes'), status='pending' WHERE id='task-finance-sweep'`. Wait 60–90s. | (a) no Telegram message; (b) `_Log` row `[ts, "finance-sweep", "success", 0, ""]`; (c) `messages_in.status` returns to `completed`; (d) next recurrence row pending. |
| S2 sweep with 1 reminder | Insert 1 row in `Lembretes` with `quando` in past, `enviado_em` empty. Trigger as in S1. | (a) Telegram receives 1 `🔔 Lembrete: …`; (b) `enviado_em` filled with ISO; (c) `_Log` row with `qtd_processada=1`. |
| S3 daily-digest | Trigger `task-finance-daily` similarly. | (a) Telegram receives formatted digest; (b) `_Log` row success. |
| S4 failure mode | Rename `_Log` → `_LogX` temporarily, trigger sweep. | (a) Telegram receives `⚠️ Cron finance-sweep: <error>`; (b) operator renames back. |

S1–S3 = minimum acceptance. S4 = optional verification of error path.

---

## 9. Migration path (Plan 2 → Plan 2.5)

Operator runs, in order:

1. `git pull` (or update skill via `/update-nanoclaw`)
2. Confirm `_Log` tab exists; ask Levis to create it if missing with headers `[timestamp, job, status, qtd_processada, detalhes]`
3. `npx tsx scripts/finance/unregister-cron-jobs.ts --session <id>`
4. `npx tsx scripts/finance/register-cron-jobs.ts --session <id>`
5. Mirror updated skill files to live workspace:
   - `cp .claude/skills/add-finance/system-prompt.md groups/finance/system-prompt.md` (full overwrite — the live file is a mirror, not a customization).
   - For `groups/finance/CLAUDE.md`: targeted in-place edit of the 4 tool-slug lines (67–73), since the live CLAUDE.md may contain customizations (SHEET_ID, locale notes) that the template doesn't have. Plan writer specifies: `sed -i` or `Edit` tool per occurrence; do not blind-overwrite.
6. Send `/clear` to `@LevisBot` so the agent reloads system-prompt + CLAUDE.md
7. Smoke test S1 + S3 (S2 + S4 optional)

---

## 10. Acceptance criteria

- [ ] vitest green (4 tests in `register-cron-jobs.test.ts`)
- [ ] 5 cron rows in inbound.db with `kind='task'` and valid JSON content
- [ ] `system-prompt.md` + `claude-md-template.md` reference only canonical Composio slugs (no `BATCH_UPDATE`, no `*_BY_DATA_FILTER`)
- [ ] `_Log` tab exists in live workbook
- [ ] S1 passes (silent sweep)
- [ ] S3 passes (daily digest formatted)
- [ ] "Tasks automáticos (CRON)" section in `system-prompt.md` (from commit `a0925dd`) preserved
- [ ] TODO comment in `register-cron-jobs.ts` pointing to `container/agent-runner/src/formatter.ts:80-105`

---

## 11. Residual risk & follow-ups

- **Composio rate limit (60r+60w/min):** daily-digest does ~6 reads + 1 append. Headroom is fine; no throttle needed.
- **Concurrent cron firings (e.g. sweep + daily at 08:00):** single agent, poll-loop sequential. Latency acceptable.
- **True persona override (layers 1+2+3 all fail):** if S1 fails with the model still chatting casually despite triple-wrapping, escalate to Plan 2.6 — generic `kind='system_task'` in `formatter.ts` with a poll-loop prompt-override layer. Out of scope here.
- **Generic `kind='scheduled'` silent-drop in `formatter.ts:80-105`:** documented in inline TODO; future plan should add a case so this bug doesn't recur for other agents.

---

## 12. What's NOT in this spec

- Adding `kind='system_task'` or any new kind to the generic formatter.
- Any change to `container/agent-runner/` code.
- Backfilling the formatter bug fix for other (non-finance) agents.
- Adjusting cron schedules from Plan 2 (`0 8-22 * * *` etc) — those remain as-is.
- Plaid / open-finance / brokerage / multi-currency — same exclusions as Plan 2.
