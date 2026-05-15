/**
 * One-off: rewrite the `content` field of every pending recurring row in
 * Lili's and Lobby's inbound.db, so the new _override-block.md takes effect
 * on the next firing. Without this, the row carries the stale override text
 * that was materialized at registration time.
 *
 * Matches rows by recurrence pattern → promptFile (from each agent's
 * cron-jobs.json), regardless of the row's auto-generated msg-* id.
 *
 * Idempotent. Safe to re-run.
 *
 * Usage: npx tsx scripts/refresh-pending-cron-content.ts
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

interface Target {
  label: string;
  inboundDb: string;
  promptsDir: string;
  configPath: string;
}

const ROOT = process.cwd();
const targets: Target[] = [
  {
    label: 'lili',
    inboundDb: path.join(
      ROOT,
      'data/v2-sessions/ag-1777716884403-tzmkqz/sess-1777726480273-qkhz9a/inbound.db',
    ),
    promptsDir: path.join(ROOT, 'groups/lili/scheduled-jobs'),
    configPath: path.join(ROOT, 'scripts/lili/cron-jobs.json'),
  },
  {
    label: 'lobby',
    inboundDb: path.join(
      ROOT,
      'data/v2-sessions/lobby/sess-1778748957751-d3fb3l/inbound.db',
    ),
    promptsDir: path.join(ROOT, 'groups/lobby/scheduled-jobs'),
    configPath: path.join(ROOT, 'scripts/lobby/cron-jobs.json'),
  },
];

interface JobConfig {
  id: string;
  kind: string;
  recurrence: string;
  promptFile: string;
}

for (const t of targets) {
  if (!fs.existsSync(t.inboundDb)) {
    console.log(`[${t.label}] inbound.db not found, skipping`);
    continue;
  }
  const config = JSON.parse(fs.readFileSync(t.configPath, 'utf8')) as { jobs: JobConfig[] };
  const override = fs.readFileSync(path.join(t.promptsDir, '_override-block.md'), 'utf8');

  const db = new Database(t.inboundDb);
  const stmt = db.prepare(
    `UPDATE messages_in SET content = ? WHERE recurrence = ? AND status = 'pending'`,
  );

  let total = 0;
  for (const job of config.jobs) {
    const procedural = fs.readFileSync(path.join(t.promptsDir, job.promptFile), 'utf8');
    const prompt = override + '\n\n' + procedural;
    const content = JSON.stringify({ prompt });
    const info = stmt.run(content, job.recurrence);
    console.log(`[${t.label}] ${job.id} (${job.recurrence}) → ${info.changes} row(s) updated`);
    total += info.changes;
  }
  db.close();
  console.log(`[${t.label}] total: ${total} pending recurring row(s) refreshed`);
}
