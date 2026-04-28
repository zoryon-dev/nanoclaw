# Upstream Sync — 2026-04-28

Selective cherry-pick from upstream/main (366 commits ahead, merge-base `db3aa0b`).
Avoided full merge because upstream restructured `src/` into `src/modules/...`
which the local v2 + swarm + Composio customizations pre-date.

## Backup

- Tag: `pre-update-cfa49aa-20260428-000206`
- Branch: `backup/pre-update-cfa49aa-20260428-000206`
- Rollback: `git reset --hard pre-update-cfa49aa-20260428-000206 && ./container/build.sh && systemctl restart nanoclaw`

## Cherry-picked

| Commit | Upstream hash | Why |
|---|---|---|
| `00498af` | `81ef193` | session-state keyed per provider — flipping provider no longer hands a Codex thread id to Claude. Resolved conflicts in `poll-loop.ts` (preserved local command categorization: admin/filtered/passthrough). |
| `6c467ba` | `97868af` | `pending_questions`/`pending_approvals` inserts idempotent — retry no longer trips UNIQUE. |
| `a96c034` | `ff277c0` | Telegram callback_data 64-byte fix — `ask_question` cards survive long option values (ISO datetimes, URLs). Important for swarm. Preserved local `dmOnly?: boolean` on `ChatSdkBridgeConfig`. |
| `3fd1bf7` | `bee80b0` | Clear orphan heartbeat before spawn — fresh container no longer killed by stale mtime. Imports trimmed to skip the `providers/provider-container-registry` refactor that doesn't exist locally. |
| `6955987` | (local) | Convert `session-state.test.ts` from `bun:test` to `vitest` — upstream wrote against the post-Bun-migration runtime; local agent-runner tests still run via host vitest. |

## Skipped (intentional)

| Upstream hash | What | Why skipped |
|---|---|---|
| `fd09b89` | agent-route: reject unsafe attachment filenames (path traversal) | Targets `src/modules/agent-to-agent/agent-route.ts` which doesn't exist locally. Requires the full `src/modules/` refactor to land. |
| `672e228` | agent-route: forward attachments between agents | Same reason as above. |
| `209061f` | sweep: wake-before-reset + idempotent retry for orphan claims | Local `host-sweep.ts` was rewritten — has `detectStaleContainers` instead of `resetStuckProcessingRows`/`enforceRunningContainerSla`. The reorder is a no-op locally; `bee80b0` already covers the most common orphan case. |
| `2383bde` | container: scope orphan reaper by install label | Requires `src/install-slug.ts` (missing) and the use case (multiple nanoclaw installs on the same host) doesn't apply here. Re-evaluate if a second install ever lives alongside this one. |

## Deferred refactor

The big unlock for the skipped attachment fixes is upstream's `src/modules/` reorganization:

- `src/modules/agent-to-agent/` (agent-route, create-agent, write-destinations)
- `src/modules/permissions/` (channel/sender approval, user-roles, user-dms)
- `src/modules/approvals/` (onecli-approvals, picks, primitive, response-handler)
- `src/modules/scheduling/` (recurrence, actions, db)
- `src/modules/self-mod/` (apply, request)
- `src/modules/interactive/`
- `src/modules/typing/`

These collide hard with local swarm code (`src/delivery.ts`, `src/router.ts`, `src/session-manager.ts`).
When the refactor is taken, run `/migrate-nanoclaw` from a clean state — the
existing `01-08` guides cover persona, MCP, container skills, etc.; this file
plus the swarm/Composio commits cover the rest.

## Verification

- `npm run build` (tsc on host + agent-runner): clean
- `npm test`: 405 passed (30 files); +9 tests from per-provider session-state
- `./container/build.sh`: rebuilt `nanoclaw-agent:latest`
- `systemctl restart nanoclaw`: service active, no errors in journal
