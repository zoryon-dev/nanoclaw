# Poll-loop Stuck After /compact — 2026-04-28

## Symptom

After the SDK emits a `Context compacted (N tokens compacted).` result event (auto- or user-triggered `/compact`), the agent-runner poll-loop emits `[poll-loop] No SDK events for 20s, ending query` at the polling interval (every 500ms) — hundreds of log lines per second forever. The container never picks up new inbound messages and the agent appears dead from the user's perspective.

Observed at 11:07:57 in Caio (`content-machine`) right after a /compact with 136,938 tokens compacted: log spam continues for hours, container stays "Up", no further work happens.

## Root cause

`container/agent-runner/src/poll-loop.ts` `processQuery` checks `Date.now() - lastEventTime > IDLE_END_MS` on every 500ms tick. When the condition is met it logs and calls `query.end()`. But `done` is only set in the `finally` block of the for-await loop, which doesn't fire until the SDK iterator actually terminates. After `/compact` the SDK iterator can stay pending indefinitely (the iterator is "open" waiting for the next user turn but no result/end event arrives), so `done` stays `false`, the interval keeps re-evaluating the (still-true) idle condition, and re-calls `query.end()` + re-logs every 500ms.

## Fix

Two changes in `container/agent-runner/src/poll-loop.ts`:

1. Add `endRequested` flag set right after the first `query.end()` call. Skip the idle check on subsequent ticks so `query.end()` is called exactly once and the log line is emitted exactly once.
2. As a safety net, if the iterator hasn't terminated within 10s of `endRequested = true`, call `query.abort()` (force-stop) so the container can exit cleanly. This handles the post-compact case where `query.end()` alone isn't enough.

```diff
   let queryContinuation: string | undefined;
   let done = false;
+  let endRequested = false;
+  let endRequestedAt = 0;
   let lastEventTime = Date.now();

   const pollHandle = setInterval(() => {
     if (done) return;
+
+    if (endRequested) {
+      if (Date.now() - endRequestedAt > 10_000) {
+        log('SDK iterator did not terminate 10s after end(), aborting');
+        query.abort();
+      }
+      return;
+    }
     ...
     if (Date.now() - lastEventTime > IDLE_END_MS) {
       log(`No SDK events for ${IDLE_END_MS / 1000}s, ending query`);
+      endRequested = true;
+      endRequestedAt = Date.now();
       query.end();
     }
```

## Apply

1. Edit `container/agent-runner/src/poll-loop.ts` as above.
2. `npm run build` (host) and verify `npx vitest run container/agent-runner/src/poll-loop.test.ts` passes.
3. `./container/build.sh` to rebuild agent image.
4. Propagate to per-group source copies (each agent has its own at `data/v2-sessions/<id>/agent-runner-src/`):
   ```bash
   for ag in $(ls data/v2-sessions/ | grep '^ag-'); do
     cp container/agent-runner/src/poll-loop.ts data/v2-sessions/$ag/agent-runner-src/poll-loop.ts
     chown 1000:1000 data/v2-sessions/$ag/agent-runner-src/poll-loop.ts
   done
   ```
   Validate compile inside container: `docker run --rm --entrypoint bash -v $(pwd)/data/v2-sessions/<ag>/agent-runner-src:/app/src nanoclaw-agent:latest -c 'cd /app && npx tsc --outDir /tmp/dist'` — must exit 0.
5. Kill any stuck container so the next spawn picks up the new code:
   ```bash
   docker ps --filter name=nanoclaw-v2 --format '{{.Names}}' | xargs -r docker kill
   sqlite3 data/v2.db "DELETE FROM active_agent_routes;"
   ```

## Verification

After applying, trigger a `/compact` flow (or wait for auto-compact) and confirm:

1. The "ending query" log line appears at most twice (once for end(), maybe once for abort()).
2. The container processes new inbound messages within seconds of the next user turn.
3. No tight loop in `logs/nanoclaw.log`.

If `query.abort()` fires regularly in production, the underlying provider (Claude SDK) is leaving its iterator open after compact — which is upstream behavior we work around here. Note for future upstream syncs: a cleaner fix would be in the provider adapter to detect compact-result events and end the stream itself.
