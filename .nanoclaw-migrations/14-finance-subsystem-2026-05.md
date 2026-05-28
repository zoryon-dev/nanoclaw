# 14 — Finance Subsystem (2026-05)

A dedicated finance agent ("Levis") backed by Google Sheets, fed bank-statement
CSV/XLS files through Telegram. Three reapplication units: a container CLI skill,
a feature skill, and a host-side attachment-routing change. **Custom — always reapply.**

## A. `finance-csv` container skill — `container/skills/finance-csv/`

Self-contained ESM CLI. Parses bank statements, auto-detects source, classifies
transactions against a cache, reconciles against a Google Sheets dump.

**Structure:**
- `lib/cli.mjs` — router
- `lib/parsers/{btg_pf,btg_pj,inter,hotmart,detect}.mjs` — per-source parsers + source auto-detection (OLE2/XLS magic bytes + CSV header signatures)
- `lib/classify.mjs` — source-hint-priority classification against a cache
- `lib/fuzzy.mjs` — token-set Jaccard matcher
- `lib/normalize.mjs` — `descricao` normalization for cache keys
- `lib/reconcile.mjs` — 7-bucket deterministic matching (matched / skipped_reimport / new / suspicious / …)
- `finance-csv` — shell wrapper (the bin)
- `package.json` — single runtime dep `xlsx@^0.18.5` (BTG PF is binary XLS)
- `__tests__/` — parsers, classify, fuzzy, normalize, reconcile + anonymized fixtures (BTG PF `.xls`, BTG PJ `.csv`, Inter `.csv`, Hotmart `.csv`)

**Reapply:** copy the whole `container/skills/finance-csv/` directory as-is from
the main tree.

**CLI surface:**
```bash
finance-csv parse <file> [--bank btg_pf|btg_pj|inter|hotmart] [--out canonical.json]
finance-csv classify "<descricao>" --cache <path>
finance-csv reconcile --csv canonical.json --sheet sheet-dump.json --cache <path> --markers <processed-dir> --out result.json
```

**Dockerfile install** — see also [16-infra-agent-runner-2026-05.md](16-infra-agent-runner-2026-05.md).
Add after the image-gen install block, before `# Create workspace directories`:

```dockerfile
# Install finance-csv CLI (Node-based, multi-file with xlsx dep)
COPY skills/finance-csv/lib /usr/local/lib/finance-csv
COPY skills/finance-csv/package.json /usr/local/lib/finance-csv/package.json
COPY skills/finance-csv/finance-csv /usr/local/bin/finance-csv
RUN cd /usr/local/lib/finance-csv && npm install --omit=dev --no-audit --no-fund \
    && chmod +x /usr/local/bin/finance-csv
```

## B. `add-finance` feature skill — `.claude/skills/add-finance/`

Operator runbook that stands up the finance agent. **Reapply:** copy the whole
`.claude/skills/add-finance/` directory as-is; the SKILL.md walks the operator
through DB setup, bot registration, sheet bootstrap, and cron registration.

Contents to preserve:
- `SKILL.md` — multi-step runbook (agent group DB row, Telegram secondary bot token → `agent_groups.container_config.telegramBotToken`, Composio googlesheets session, 9-tab workbook bootstrap, cron registration)
- `system-prompt.md` — Levis persona / current-plan instructions
- `claude-md-template.md` — workspace CLAUDE.md template (toolkit + sheet placeholders)
- `cron-jobs.json` — 8 jobs (Plan 2.5: sweep-reminder, weekly-closing, daily-digest, monthly-closing, rollover; Plan 3: audit-subscriptions trimestral, semestral, anual)
- `prompts/_override-block.md` — shared non-interactive instructions for all cron tasks
- `prompts/*.md` — per-task prompts
- Seeds: `categorias-seed.json`, `classification-cache-seed.json`, `hotmart-categoria-map-seed.json`
- `migration-prompt.md`, `bootstrap-sheet-prompt.md` — Plan 2.5 → Plan 3 upgrade path

Finance cron registration scripts live under `scripts/finance/` — see
[15-scheduling-timezone-2026-05.md](15-scheduling-timezone-2026-05.md).

## C. CSV/XLS attachment routing — `src/session-manager.ts`

Routes CSV/XLS/XLSX attachments to the persistent `<group>/imports/inbox/`
directory instead of the ephemeral per-session inbox, so the finance agent finds
them across sessions.

Import `GROUPS_DIR`:
```typescript
import { DATA_DIR, GROUPS_DIR } from './config.js';
```

Helpers (module scope):
```typescript
const CSV_XLS_MIMES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const CSV_XLS_EXTS = /\.(csv|xls|xlsx)$/i;

function isCsvOrXls(att: Record<string, unknown>): boolean {
  const mime = typeof att.mimeType === 'string' ? att.mimeType : '';
  const name = typeof att.name === 'string' ? att.name : '';
  return CSV_XLS_MIMES.has(mime) || CSV_XLS_EXTS.test(name);
}
function sanitizeFilename(raw: string): string {
  return path.basename(raw).replace(/[^\w.\-]/g, '_') || `attachment-${Date.now()}`;
}
```

In `extractAttachmentFiles`, inside the per-attachment loop, BEFORE the session
inbox fallback:
```typescript
if (isCsvOrXls(att)) {
  const agentGroup = getAgentGroup(agentGroupId);
  if (agentGroup) {
    const safeFilename = sanitizeFilename((att.name as string) || `attachment-${Date.now()}`);
    const groupInboxDir = path.join(GROUPS_DIR, agentGroup.folder, 'imports', 'inbox');
    fs.mkdirSync(groupInboxDir, { recursive: true });
    fs.writeFileSync(path.join(groupInboxDir, safeFilename), Buffer.from(att.data as string, 'base64'));
    att.localPath = `agent/imports/inbox/${safeFilename}`;
    delete att.data;
    changed = true;
    continue;
  }
  log.warn('CSV/XLS attachment: agent group not found, falling back to session inbox');
}
// ... existing session-inbox fallback for non-CSV attachments ...
```

## D. PII protection — `.gitignore`

```
extratos/          # Real bank statements (PII) — never commit; fixtures must be anonymized
*-system-prompt.pdf
*-system-prompt.md
*-knowledge.zip
```

(The `.gitignore` also gained the `lobby` group whitelist and
`.claude/scheduled_tasks.lock` / `.claude/projects/` — see
[16-infra-agent-runner-2026-05.md](16-infra-agent-runner-2026-05.md).)
