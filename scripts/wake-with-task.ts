/**
 * Enqueue a one-off on_wake task message into an agent group's most-recent
 * active session, then exit. The LIVE host's sweep (≤60s) sees the due message
 * and spawns the container; the fresh container's first poll picks up the
 * on_wake message and acts on it. We do NOT spawn the container here — that
 * would mean managing docker out-of-band from the running host.
 *
 * Mirrors the on_wake message shape used by container-restart.ts
 * (kind 'chat', channelType 'agent', content {text,sender,senderId},
 * onWake 1, trigger 1-by-default). Use for operator-driven one-off tasks
 * (seeds, maintenance) when no container is currently running.
 *
 * Usage: pnpm exec tsx scripts/wake-with-task.ts <agentGroupId> "<task text>"
 */
import path from 'path';

import { DATA_DIR } from '../src/config.js';
import { initDb } from '../src/db/connection.js';
import { getSessionsByAgentGroup } from '../src/db/sessions.js';
import { writeSessionMessage } from '../src/session-manager.js';

initDb(path.join(DATA_DIR, 'v2.db'));

const agentGroupId = process.argv[2];
const text = process.argv[3];

if (!agentGroupId || !text) {
  console.error('Usage: tsx scripts/wake-with-task.ts <agentGroupId> "<task text>"');
  process.exit(1);
}

const active = getSessionsByAgentGroup(agentGroupId)
  .filter((s) => s.status === 'active')
  .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

if (active.length === 0) {
  console.error(`No active session for agent group ${agentGroupId}`);
  process.exit(1);
}

const session = active[0];
const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

writeSessionMessage(agentGroupId, session.id, {
  id,
  kind: 'chat',
  timestamp: new Date().toISOString(),
  platformId: agentGroupId,
  channelType: 'agent',
  threadId: null,
  content: JSON.stringify({ text, sender: 'system', senderId: 'system' }),
  onWake: 1,
});

console.log(
  `Queued on_wake task ${id} into session ${session.id} (of ${active.length} active). ` +
    `Host sweep will wake the container within ~60s.`,
);
