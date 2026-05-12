/**
 * Remove the orphaned data/v2-sessions/<id>/agent-runner-src/ directories left
 * behind by the pre-Plan 2.7 per-session copy pattern. After Plan 2.7, the
 * container mounts container/agent-runner/src/ directly (RO), so these
 * per-session copies are dead disk.
 *
 * Idempotent: re-running is a no-op once everything is cleaned. Safe to run
 * before or after host restart — does not touch any active session DB or
 * agent state.
 *
 * Usage:
 *   npx tsx scripts/cleanup-stale-agent-runner-src.ts
 */
import fs from 'fs';
import path from 'path';

const dataDir = path.join(process.cwd(), 'data', 'v2-sessions');
if (!fs.existsSync(dataDir)) {
  console.error(`Data dir not found: ${dataDir}`);
  process.exit(1);
}

let removed = 0;
const entries = fs.readdirSync(dataDir, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const stale = path.join(dataDir, entry.name, 'agent-runner-src');
  if (fs.existsSync(stale)) {
    fs.rmSync(stale, { recursive: true, force: true });
    console.log(`✓ removed ${stale}`);
    removed++;
  }
}
console.log(`\nDone. Removed ${removed} stale agent-runner-src directories.`);
console.log('Containers now read /app/src directly from container/agent-runner/src/ (Plan 2.7).');
