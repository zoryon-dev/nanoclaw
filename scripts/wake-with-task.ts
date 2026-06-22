/**
 * Enqueue a one-off task message into an agent group's most-recent active
 * session, then exit. If a container is already running it picks the message
 * up on its next poll; if none is running, the LIVE host's sweep (≤60s) sees
 * the due message (countDueMessages gates on trigger=1) and spawns one, whose
 * first poll picks it up. We do NOT spawn the container here — that would mean
 * managing docker out-of-band from the running host.
 *
 * Message shape: kind 'chat', channelType 'agent', content {text,sender,senderId},
 * trigger 1 (default). We deliberately do NOT set onWake=1: that flag restricts
 * delivery to a fresh container's FIRST poll, so an already-running container
 * (past its first poll) would skip it and the task would stall. trigger-only
 * is picked up whether or not a container is currently running. Use for
 * operator-driven one-off tasks (seeds, maintenance, smokes).
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
});

console.log(
  `Queued task ${id} into session ${session.id} (of ${active.length} active). ` +
    `A running container picks it up on its next poll; otherwise the host sweep spawns one within ~60s.`,
);
