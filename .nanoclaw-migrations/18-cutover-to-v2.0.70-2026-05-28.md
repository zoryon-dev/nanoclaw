# 18 — Cutover to upstream/main v2.0.70 (2026-05-28)

Record of the attempted full cutover from the early-v2 fork onto clean
`upstream/main` (2492259, v2.0.70). Built on branch `upgrade/upstream-2.0.70`
in a worktree. **The live system was NOT switched** — this branch is the
upgraded code, ready for a deliberate go-live.

Base: db3aa0b · Fork HEAD: 18df8ce · Upstream: 2492259 (v2.0.70, +908 commits)

## Breaking changes crossed (and how they hit our customizations)

| Upstream breaking change | Effect on our customizations |
|---|---|
| **Channels moved to `channels` branch** | `telegram.ts`/`whatsapp.ts`/sanitizer absent in trunk. Re-installed from `upstream/channels` (see "Reapplied" below). |
| **Two-DB session split** (`inbound.db`/`outbound.db`) | Attachment + recurrence + DB code restructured. Made several of our "fixes" obsolete. |
| **New entity model** (user-level roles, `messaging_group_agents`) | `NANOCLAW_ADMIN_USER_IDS` retired → admin-id normalization graft **dropped**. |
| **Providers moved to branch**; **Apple Container opt-in** | No effect (we use Claude + Docker). |
| **Toolchain**: host `pnpm` (3-day supply-chain gate), agent-runner `bun` | `better-sqlite3` add to agent-runner **dropped** (Bun uses `bun:sqlite`); deps installed via pnpm. |

## Reapplied (in this branch, builds + tests green)

- **Channels**: copied `telegram.ts`, `telegram-pairing.ts`(+test), `telegram-markdown-sanitize.ts`(+test), `whatsapp.ts`, `setup/pair-telegram.ts`, `setup/whatsapp-auth.ts`, `setup/groups.ts` from `upstream/channels`; appended `import './telegram.js'` / `import './whatsapp.js'` to `src/channels/index.ts`. Deps: `@chat-adapter/telegram@4.26.0`, `@whiskeysockets/baileys@7.0.0-rc.9`, `qrcode@1.5.4`, `@types/qrcode@1.5.6`, `pino@9.6.0`.
- **Finance subsystem**: `container/skills/finance-csv/` (copied), `.claude/skills/add-finance/` (copied), `scripts/finance/` (copied), Dockerfile finance-csv install block (re-added, isolated `npm install` in `/usr/local/lib/finance-csv`).
- **Persona/knowledge**: 11 `container/skills/*` dirs + `.claude/skills/find-skills/` (copied as-is).
- **Cron scripts**: `scripts/lili/`, `scripts/lobby/` (copied).
- **Media files (host)**: `src/transcription.ts`, `src/image.ts`(+test) present; deps `openai@^6.35`, `sharp@^0.34.5` installed. **NOT yet wired** — see Deferred.
- **PII**: `.gitignore` gained `extratos/`.
- `src/db/sqlite-utc.ts`(+test) present but **unused** (see Obsolete).

## Obsolete / already-in-upstream (correctly NOT reapplied)

- **Admin-id normalization** (`formatter.ts`) — env-var admin model retired; roles live in central DB + `src/command-gate.ts`. Drop.
- **Recurrence BRT timezone** — upstream `src/modules/scheduling/recurrence.ts` already parses cron in `TIMEZONE` (from config via `resolveConfigTimezone()`). Just ensure the install's TZ env = `America/Sao_Paulo`. No code graft.
- **`toSqliteUtc`** — upstream recurrence uses `.toISOString()`; helper unused. Leaving the file is harmless; can delete.
- **Read-only agent-runner mount** (`container-runner.ts`) — upstream already mounts `container/agent-runner/src` RO ("Source code and skills are shared RO mounts").
- **Per-group agent-runner-src copy removal** (`group-init.ts`) — upstream already doesn't copy per group.
- **vitest `scripts/**/*.test.ts` glob** — already in upstream `vitest.config.ts`.
- **`better-sqlite3` in agent-runner** — Bun uses `bun:sqlite`. Drop.
- **poll-loop scratchpad-only warning / `IDLE_END_MS` bump** — agent-runner output handling rewritten (`<message>`/`<internal>` tags). Obsolete as written.

## Deferred — genuine customizations needing careful re-implementation

These were NOT grafted because they touch security-hardened or
architecture-shifted code and a blind graft would be subtly wrong. Each needs a
dedicated, tested re-implementation against the new arch:

1. **CSV/XLS routing → `<group>/imports/inbox/`** (`src/session-manager.ts`).
   The new `extractAttachmentFiles` is symlink-hardened and writes to the
   per-session inbox `sessionDir/inbox/<messageId>/<filename>` with a `wx`
   exclusive flag + realpath containment. To route finance CSV/XLS to a
   persistent group dir: add a branch that resolves the agent group's folder,
   writes under `GROUPS_DIR/<folder>/imports/inbox/` preserving the SAME safety
   pattern (lstat, realpath containment, `wx`), and sets `localPath` per the
   NEW container mount layout (group dir is mounted at `/workspace/group`).
   Verify the container-side path the finance agent reads matches.

2. **Media pipeline wiring** (voice transcription + image vision).
   `src/transcription.ts` and `src/image.ts` exist but are **unwired** — in the
   new arch, inbound attachments are persisted by `session-manager.extractAttachmentFiles`,
   not by `chat-sdk-bridge.ts`. Voice: transcribe audio and append text to the
   message before the container reads it. Image vision (container side): the
   agent-runner `formatter.ts` has NO image extraction; `providers/types.ts`
   `QueryInput` has no `images` field; `providers/claude.ts` sends text only.
   This is equivalent to the v2 `add-voice-transcription` + `add-image-vision`
   skills — prefer applying those skills over hand-grafting, then reconcile with
   the custom `transcription.ts`/`image.ts` if their behavior differs.

3. **Telegram URL preservation in sanitizer** (`src/channels/telegram-markdown-sanitize.ts`).
   The `upstream/channels` version flattens horizontal rules but does NOT
   protect bare URLs with underscores (OAuth/Composio authorize links). If those
   still break, graft the `URL_PATTERN` placeholder protect/restore from
   [16-infra-agent-runner-2026-05.md](16-infra-agent-runner-2026-05.md) §6 onto
   the new sanitizer.

4. **Group dir writability** (`src/group-init.ts`).
   Our old `chownRecursive(groupDir)` graft has no equivalent hook in the
   rewritten `initGroupFilesystem`. Verify the new permission/mount model lets
   the container (uid 1000 / `node`) write its own `CLAUDE.local.md` and
   `imports/` before relying on it.

## Remaining steps to actually GO LIVE (deliberate, not done here)

1. **Channel credentials**: `TELEGRAM_BOT_TOKEN` in `.env`; WhatsApp re-pair
   (`store/auth/`). The swarm (multi-bot) is NOT re-set-up — confirm whether the
   new Telegram adapter supports the per-bot swarm identities the fork used.
2. **Data/schema migration**: the live `data/v2.db` + sessions are early-v2
   schema. Upstream migrations (`src/db/migrations/`, 13 of them) run on host
   start, but verify they cover the entity-model + two-DB split for existing
   data. This skill is code-only and did not touch `data/`/`groups/`.
3. **Build the image**: `./container/build.sh` (Dockerfile changed).
4. **Re-register crons** after first boot: `scripts/{finance,lili,lobby}/register-cron-jobs.ts`.
5. **Composio re-auth** per [[project_composio_auth]] matrix.
6. **Switch the service** to this branch only after the above + a live smoke test.

## Validation done on this branch

- `pnpm run build` — clean.
- `pnpm test` — 386 passed (37 files).
- agent-runner `bun run typecheck` — clean; `bun test` — 98 passed (9 files).
