# 15 — Scheduling & Timezone (2026-05)

Recurring-task scheduling in `America/Sao_Paulo` and per-agent cron job
registration. **Custom — always reapply.** (The user explicitly flagged the
SQLite-UTC and host-sweep changes as theirs, even though they look like generic
fixes — reapply them; reconcile if the upstream version differs.)

## 1. SQLite UTC helper — `src/db/sqlite-utc.ts` (new) + test

SQLite string comparisons need `YYYY-MM-DD HH:MM:SS` (space, no `T`/`Z`),
because ISO `T` sorts after a space in ASCII and breaks
`WHERE process_after <= datetime('now')`.

```typescript
export function toSqliteUtc(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
```

Recreate `src/db/sqlite-utc.test.ts` including the regression guard that the
comparison ordering is correct.

## 2. Host-sweep recurrence in BRT — `src/host-sweep.ts` + test

`handleRecurrence` is **synchronous** (avoids a DB-close-mid-await bug) and parses
cron in `America/Sao_Paulo` (matches the human intent of finance/Lili/Lobby jobs),
formatting the next run via `toSqliteUtc`.

```typescript
import { CronExpressionParser } from 'cron-parser';
import { toSqliteUtc } from './db/sqlite-utc.js';

export function handleRecurrence(inDb: Database.Database, session: Session): void {
  const recurring = getCompletedRecurring(inDb);
  for (const msg of recurring) {
    try {
      const interval = CronExpressionParser.parse(msg.recurrence, { tz: 'America/Sao_Paulo' });
      const nextRun = toSqliteUtc(interval.next().toDate());
      const newId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      insertRecurrence(inDb, msg, newId, nextRun);
    } catch (err) {
      log.error('Failed to compute next recurrence', { recurrence: msg.recurrence, err });
    }
  }
}
```

Recreate `src/host-sweep.test.ts` (timezone verification + regression guards).

> `cron-parser` export name: this fork uses `CronExpressionParser` (v4+ named
> export). If upstream pins an older `cron-parser`, adapt the import accordingly.

## 3. Per-agent cron registration scripts — `scripts/{lili,lobby,finance}/`

Each registers recurring `task` rows by reading a `cron-jobs.json` +
`prompts/_override-block.md` + per-job `promptFile` markdown, then
`INSERT OR REPLACE` into `messages_in` (idempotent). Run with `tsx`:

```bash
npx tsx scripts/finance/register-cron-jobs.ts --session <session-id>
npx tsx scripts/finance/unregister-cron-jobs.ts --session <session-id>
npx tsx scripts/lili/register-cron-jobs.ts --session <session-id>
npx tsx scripts/lobby/register-cron-jobs.ts --session <session-id>
```

**Reapply:** copy the `scripts/lili/`, `scripts/lobby/`, `scripts/finance/`
directories as-is. Job definitions:

**Lili** (`scripts/lili/cron-jobs.json`):
- `task-lili-toque-matinal` — `0 7 * * *` — toque-matinal.md
- `task-lili-ritual-noturno` — `30 18 * * *` — ritual-noturno.md
- `task-lili-revisao-semanal` — `0 16 * * 0` — revisao-semanal.md

**Lobby** (`scripts/lobby/cron-jobs.json`):
- `task-lobby-morning-briefing` — `0 6 * * *` — morning-briefing.md (firstRunOffsetMs 60000)
- `task-lobby-daily-focus-check` — `0 11,15,19 * * *` — daily-focus-check.md (firstRunOffsetMs 60000)

**Finance** — jobs defined in `.claude/skills/add-finance/cron-jobs.json` (8 jobs,
Plan 2.5 + Plan 3); `scripts/finance/register-cron-jobs.ts` reads them. See
[14-finance-subsystem-2026-05.md](14-finance-subsystem-2026-05.md).

> All schedules are interpreted in `America/Sao_Paulo` by the host-sweep change
> above — they will be wrong if that timezone fix is not also reapplied.

## 4. vitest config — `vitest.config.ts`

Add `scripts/**/*.test.ts` to `include` so `scripts/finance/__tests__/` runs:

```typescript
include: [
  'src/**/*.test.ts',
  'setup/**/*.test.ts',
  'container/agent-runner/src/**/*.test.ts',
  'scripts/**/*.test.ts',
],
```
