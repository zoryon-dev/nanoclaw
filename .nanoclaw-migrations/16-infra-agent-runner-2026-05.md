# 16 — Infra & Agent-Runner (2026-05)

Container mount architecture, agent-runner behavior, and small infra deltas.
**All custom — always reapply.** Several of these resemble generic upstream fixes;
the user confirmed they want them treated as their own and reapplied. When new
upstream already implements equivalent behavior, reconcile rather than duplicate
(e.g. don't add a second declaration) — but ensure the behavior below is present.

## 1. Read-only agent-runner source mount — `src/container-runner.ts` + test

Bind `container/agent-runner/src/` read-only from the git repo instead of copying
it per-session (fixes silent drift; cuts data bloat).

Make the mount type exported and add a builder:
```typescript
export interface VolumeMount { /* hostPath, containerPath, readonly */ }

export function buildAgentRunnerMounts(projectRoot: string): VolumeMount[] {
  return [{
    hostPath: path.join(projectRoot, 'container', 'agent-runner', 'src'),
    containerPath: '/app/src',
    readonly: true,
  }];
}
```

In `buildMounts`, replace the per-group `agent-runner-src` mount with:
```typescript
mounts.push(...buildAgentRunnerMounts(process.cwd()));
```

Also bump the container build timeout in `buildAgentGroupImage` from `300_000` to
`900_000` ms. Recreate `src/container-runner.test.ts` regression guards.

## 2. Group init cleanup + chown — `src/group-init.ts`

In `initGroupFilesystem`:
- **Remove** the block that copies `agent-runner-src` per group (now mounted RO).
- In the uid=0 chown block, after chowning `v2-sessions/<group.id>`, also chown the
  group dir itself so the container (uid 1000) can write its own `CLAUDE.md`,
  `perfil/`, `plano/`, etc.:
  ```typescript
  chownRecursive(groupDir);
  ```

## 3. Stale-copy cleanup script — `scripts/cleanup-stale-agent-runner-src.ts`

Removes orphaned `data/v2-sessions/<session>/agent-runner-src/` dirs left by the
pre-mount copy pattern. Idempotent. Copy as-is. (`scripts/composio-generate-auth-links.mjs`
is covered in [17-persona-knowledge-skills-2026-05.md](17-persona-knowledge-skills-2026-05.md).)

## 4. Agent-runner poll-loop — `container/agent-runner/src/poll-loop.ts`

- **Idle timeout**: bump `IDLE_END_MS` from `120_000` to `300_000` — agent turns
  with slow MCP tools (Composio cold-start, Drive/Gmail) were being cut at 120s.
- **Scratchpad-only warning**: only warn on "no outbound messages" when a
  scratchpad exists (agent actually ran), to avoid false positives on tool-only turns:
  ```typescript
  if (sent === 0 && scratchpad) { /* warn */ }
  ```
- Image-count in the processing log — see [13-media-pipeline-2026-05.md](13-media-pipeline-2026-05.md).

## 5. Admin user-ID normalization — `container/agent-runner/src/formatter.ts`

Compose a channel-prefixed sender ID (`telegram:8557164566`) so admin checks
against `NANOCLAW_ADMIN_USER_IDS` work across message sources and swarm bots.
Handles three sources (WhatsApp `content.sender`, Chat SDK `content.author.userId`,
already-prefixed `content.senderId`) and strips swarm suffixes
(`telegram-finance` → `telegram`):

```typescript
const rawSender =
  (typeof content.senderId === 'string' && content.senderId) ||
  (typeof content.author?.userId === 'string' && content.author.userId) ||
  (typeof content.sender === 'string' && content.sender) ||
  null;
const userKind = (msg.channel_type || '').split('-')[0];
const senderId =
  rawSender === null
    ? null
    : rawSender.includes(':') || !userKind
      ? rawSender
      : `${userKind}:${rawSender}`;
```

Covered by `formatter.test.ts` cases (WhatsApp/Telegram prefixing, swarm-suffix
strip, null handling).

## 6. Telegram markdown sanitizer — `src/channels/telegram-markdown-sanitize.ts` + test

Protect bare URLs (OAuth params with underscores, e.g. Composio authorize links)
and horizontal rules from the markdown-stripping pass.

Add patterns:
```typescript
const URL_PATTERN = /https?:\/\/[^\s)<>]+/g;
const URL_PLACEHOLDER_PREFIX = '\x00URL';
```
Protect URLs before stripping:
```typescript
const urlSegments: string[] = [];
text = text.replace(URL_PATTERN, (m) => {
  urlSegments.push(m);
  return `${URL_PLACEHOLDER_PREFIX}${urlSegments.length - 1}${PLACEHOLDER_SUFFIX}`;
});
```
Strip horizontal rules:
```typescript
text = text.replace(/^[ \t]*([-*_])\1{2,}[ \t]*$/gm, '');
```
Restore URLs before final code-span restore:
```typescript
text = text.replace(new RegExp(`${URL_PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}`, 'g'), (_, i) => urlSegments[Number(i)]);
```
Add the two test cases (bare OAuth URL preserved; markdown-link URL underscores preserved).

## 7. container agent-runner dependency

`container/agent-runner/package.json`:
```json
"dependencies": { "better-sqlite3": "^11.10.0" },
"devDependencies": { "@types/better-sqlite3": "^7.6.12" }
```
Run `npm install` in `container/agent-runner/` to refresh its lockfile.

## 8. `.gitignore` — lobby group + session-local state

Beyond the finance PII entries (see [14](14-finance-subsystem-2026-05.md)):
- Lobby group whitelist (track only intended files):
  `!groups/lobby/CLAUDE.md`, `!groups/lobby/system-prompt.md`,
  `!groups/lobby/perfil-aluno.md`, `!groups/lobby/references/`,
  `!groups/lobby/assets/`, `!groups/lobby/scheduled-jobs/`, `!groups/lobby/scratch/`
- Claude Code session-local state: `.claude/scheduled_tasks.lock`, `.claude/projects/`
