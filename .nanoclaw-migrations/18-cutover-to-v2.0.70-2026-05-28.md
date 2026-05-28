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

## Grafts applied 2026-05-28 (second pass — builds + tests green)

1. **CSV/XLS routing → `<group>/imports/inbox/`** (`src/session-manager.ts`) ✅ DONE.
   Added `isCsvOrXls` + `saveCsvToGroupImports` and a branch in
   `extractAttachmentFiles`. Writes to `GROUPS_DIR/<folder>/imports/inbox/<file>`
   using the SAME safety dance as the session inbox (lstat real-dir check,
   realpath containment under the group dir, exclusive `wx` write, symlink
   refusal on EEXIST). Sets `localPath = agent/imports/inbox/<file>` — the group
   dir is mounted at `/workspace/agent`, so `formatAttachments` shows the agent
   `saved to /workspace/agent/imports/inbox/<file>`. Resolves group via
   `getAgentGroup(agentGroupId).folder`.

2. **Telegram URL preservation** (`src/channels/telegram-markdown-sanitize.ts`) ✅ DONE.
   Added `URL_PATTERN` + `\x00URL` placeholder protect/restore around the
   delimiter-stripping passes, so bare OAuth/Composio URLs survive the
   odd-underscore strip. Sanitizer tests still pass (15).

3. **Group dir writability** (`src/group-init.ts`) ✅ DONE.
   Re-added the root-host chown block (`getuid()===0` → `chownRecursive` of
   `data/v2-sessions/<id>` and `groupDir` to 1000:1000). Needed because upstream
   only passes `--user` for non-root hosts (`container-runner.ts:439-442`); on a
   root host the container runs as `node` (uid 1000) and would get EACCES writing
   host-(root)-created group files. **This install runs as root, so this graft is
   load-bearing.**

## Image vision — OBSOLETE (no graft needed)

The custom base64 image-injection is unnecessary in the new arch. Inbound
attachments are saved to disk and `formatter.ts:formatAttachments` tells the
agent `[<type>: <name> — saved to /workspace/<localPath>]`. Claude Code reads
the image file itself (native vision). `providers/types.ts:26` even notes the
agent's Read produces the base64 image blocks in history. So image vision works
via file-read for free. `src/image.ts`/`image.test.ts`/`sqlite-utc.ts` remain in
the branch as dead reference only.

## Still deferred — voice transcription (ONE item)

**Voice transcription** is the only genuinely unfinished behavior. The agent
cannot interpret an audio file (Claude Code has no audio), so voice notes must be
transcribed host-side and injected as text. NOT grafted here because the natural
host injection point is the **critical inbound path** and is untestable without
live audio:

- `writeSessionMessage` (`src/session-manager.ts`) is sync with ~12 callers, most
  carrying non-user/system messages — do NOT make it async globally.
- Correct injection: in `src/router.ts` `deliverToAgent` (already async, user
  inbound only), before `writeSessionMessage`, detect audio attachments in the
  message content, `await transcribeAudio(...)` (use `src/transcription.ts`,
  which is already present and uses `OPENAI_API_KEY` via `readEnvFile`), and
  append `\n[Voice: <transcript>]` to the content `text`.
- Or apply the v2 `add-voice-transcription` skill and reconcile.
- A bug here breaks ALL inbound messages, so do it with a live test, not blind.

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
