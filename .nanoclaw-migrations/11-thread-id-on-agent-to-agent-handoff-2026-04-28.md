# Thread ID Lost on Agent-to-Agent Handoff — 2026-04-28

## Symptom

Zory delegates a carousel request to Caio in the Creative_Lab Telegram group via `<message to="caio">`. Caio responds correctly, but his reply lands in the **General** topic (thread 1) instead of **CreativeLab's** (thread 2). Jonas replies in CreativeLab's, Caio (sticky-routed there) sees nothing — flow stalls.

## Root cause

`src/delivery.ts` agent-to-agent path always writes the inbound message into the target session with `threadId: null` (the source agent didn't have an outbound thread context — it received the original from a DM). When Caio's poll-loop reads that inbound and emits `<message to="creative-lab">`, `sendToDestination` copies `routing.threadId` (null) into the outbound message. The host then sends to Telegram without `message_thread_id`, which Telegram routes to General.

The session's `session_routing` row in `inbound.db` had the correct `thread_id="telegram:-1003793666825:2"` (set by `writeSessionRouting` on every container wake), but `sendToDestination` never consulted it.

## Fix

`container/agent-runner/src/poll-loop.ts` — when an agent emits `<message to="X">` for a channel destination and the inbound's `routing.threadId` is null, fall back to `session_routing.thread_id` IF the destination's channel + platform match `session_routing`. Agent-type destinations are unchanged (they don't use thread_id).

```diff
+import { getSessionRouting } from './db/session-routing.js';
+
 function sendToDestination(dest: DestinationEntry, body: string, routing: RoutingContext): void {
   const platformId = dest.type === 'channel' ? dest.platformId! : dest.agentGroupId!;
   const channelType = dest.type === 'channel' ? dest.channelType! : 'agent';
+  let threadId = routing.threadId;
+  if (threadId === null && dest.type === 'channel') {
+    const sr = getSessionRouting();
+    if (sr.channel_type === channelType && sr.platform_id === platformId && sr.thread_id) {
+      threadId = sr.thread_id;
+    }
+  }
   writeMessageOut({
     ...
-    thread_id: routing.threadId,
+    thread_id: threadId,
     ...
   });
 }
```

The match condition (`channel_type === channelType && platform_id === platformId`) ensures we only inherit the thread when sending to the session's own channel — sending to an unrelated channel never picks up a stale thread.

## Apply on a fresh checkout

1. Edit `container/agent-runner/src/poll-loop.ts` as above.
2. `npm run build && ./container/build.sh` — rebuild host TS + agent container image.
3. Propagate to per-group source copies (each agent group has its own `data/v2-sessions/<id>/agent-runner-src/`, copied at group init):
   ```bash
   for ag in $(ls data/v2-sessions/ | grep '^ag-'); do
     cp container/agent-runner/src/poll-loop.ts data/v2-sessions/$ag/agent-runner-src/poll-loop.ts
     chown 1000:1000 data/v2-sessions/$ag/agent-runner-src/poll-loop.ts
   done
   ```
4. Kill running swarm containers so next spawn picks up the new code:
   ```bash
   docker kill $(docker ps --filter name=nanoclaw-v2 --format '{{.Names}}')
   sqlite3 data/v2.db "DELETE FROM active_agent_routes;"
   ```
5. `systemctl restart nanoclaw` (host TS change is in `dist/`, picked up on restart).

## Why per-group copies exist

`src/group-init.ts:101-109` initializes `data/v2-sessions/<group-id>/agent-runner-src/` from `container/agent-runner/src/` ONCE at group creation, then never re-copies. The container mounts the per-group dir at `/app/src` so each agent can hypothetically modify its own runner. In practice nobody does, but updates to the canonical source must be hand-propagated to the existing per-group copies until/unless we add a sync step at startup.

## Verification

After applying:

1. Send a carousel request to Zory in DM (`@zory criar carrossel sobre X` in WhatsApp DM, or in Creative_Lab as catch-all).
2. Zory delegates: `<message to="caio">…</message>` + `<message to="creative-lab">Passei pro Caio. 👋</message>`.
3. Caio responds — should land in **CreativeLab's** topic, not General.
4. Jonas replies in CreativeLab's → sticky route routes to Caio → flow continues.

## Related

- `docs/telegram-forum-topics.md` — original forum-topic gotchas
- `10-swarm-routing-fix-2026-04-28.md` — Zory catch-all + Lad/Caio prompt fixes
