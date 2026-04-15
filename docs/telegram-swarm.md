# Telegram Multi-Agent Swarm

How NanoClaw v2 runs **multiple agents (Zory, Caio, Lad, Grow…) under distinct Telegram bot identities** in the same supergroup AND in private DMs, with shared memory across channels for each agent.

This document is the canonical reference. If you change anything in `src/channels/telegram.ts`, `src/channels/chat-sdk-bridge.ts`, `src/router.ts` (extractAndUpsertUser), `src/delivery.ts` (sendViaSwarmBot), or any of the activation scripts, **update this doc**.

---

## TL;DR

- **One bot per agent** (e.g., `@zory_zr_bot`, `@caio_zoryon_bot`, `@lad_zoryon_bot`, `@grow_zoryon_bot`)
- **One bot is "primary"** — it's the only one that polls the shared group; its token lives in `TELEGRAM_BOT_TOKEN` env var
- **Other bots are "secondaries"** — each has its own `TelegramAdapter` instance polling its own token, but the bridge is set to `dmOnly: true` so they only forward 1:1 DMs (the primary handles the group)
- **Outbound identity** in the shared group is selected by `agent_groups.container_config.telegramBotToken` — the swarm path in `delivery.ts` picks the matching bot's token so each agent's reply shows up with its own avatar/handle
- **Outbound identity** in a private DM is automatic — each secondary registers as its own channel (`telegram-<folder>`) and replies via that adapter natively
- **Memory is shared across all channels for an agent** via `session_mode='agent-shared'` on every wiring — Zory's WhatsApp DM, her Creative_Lab Telegram message, and her DM with `@zory_zr_bot` all hit the same session
- **Same person across all bots is one user** — `extractAndUpsertUser` normalizes `telegram-anything` → `telegram` so a single owner grant covers all bots

---

## Architecture

### Channel registration (per-process, on startup)

```
src/channels/telegram.ts (factory)
  ├── reads TELEGRAM_BOT_TOKEN from .env
  ├── calls registerSecondaryBots(primaryToken)
  │     ├── queries agent_groups.container_config for every other token
  │     └── for each: registerChannelAdapter(`telegram-<folder>`, { factory: ... dmOnly:true })
  └── returns the primary adapter (createTelegramBotAdapter(primaryToken, 'telegram', dmOnly=false))
```

`registerChannelAdapter` mutates the registry Map. `initChannelAdapters` (in `src/channels/channel-registry.ts`) iterates the Map to set up each entry — and Map iteration in JS visits entries added during the loop, so the secondaries registered inside the primary factory get instantiated in the same pass. No second-init needed.

Each adapter goes through `createChatSdkBridge` with its own `Chat` instance and its own polling loop (long-poll on `getUpdates` for that bot's token).

### Inbound flow

1. User sends a Telegram message
2. **Group message:** Telegram delivers `update` to ALL bots in the group whose privacy mode allows it. The primary bot (`@zory_zr_bot`, privacy OFF, admin) sees every message. Secondaries (privacy ON, member) only see DMs to themselves and @mentions of themselves; their `dmOnly` bridge ignores the group ones, so no duplicate routing.
3. **DM message:** delivered only to the bot the user DMed. That bot's adapter handles it.
4. Chat-SDK bridge fires one of:
   - `onDirectMessage` (DM, always)
   - `onSubscribedMessage` (group, thread already subscribed)
   - `onNewMention` (group, thread unsubscribed + bot @mentioned)
   - `onNewMessage(/[\s\S]*/)` (group, thread unsubscribed, no mention — for forum topics; only forwards if the channel is in the registered conversations map; auto-subscribes the thread)
5. Bridge calls `setupConfig.onInbound(channelId, threadId, message)` where `channelId` is `telegram:<chat_id>` (the chat-sdk adapter prefixes it).
6. `telegram.ts`'s pairing interceptor either consumes a pairing code (one-time chat registration) or forwards to the host's `onInbound` → `routeInbound`.
7. **Router (`src/router.ts`):**
   - Looks up `messaging_groups` by `(channel_type, platform_id)`. Auto-creates if missing.
   - Extracts user_id via `extractAndUpsertUser`. **Normalizes channel_type prefix:** `telegram-content-machine` → user kind `telegram` so a single owner row covers all bots.
   - Picks the agent via trigger_rules (sticky route + prefix match + fallback). For DM channels (`telegram-<folder>`), there's typically only one agent wired — the matching one.
   - Resolves the session. If the wiring's `session_mode='agent-shared'`, reuses the same session for that agent across all messaging_groups (cross-channel memory).
   - Writes the inbound message into the session's inbound.db and wakes the container.

### Outbound flow

1. Container's agent-runner writes a row to outbound.db
2. `src/delivery.ts` (`deliverSessionMessages`) polls outbound.db
3. For each undelivered row, calls `deliverMessage(msg, session, inDb)`
4. `deliverMessage` chooses the send path:
   - **Swarm path** (`channel_type === 'telegram'`): looks up `agent_groups.container_config.telegramBotToken` for the session's agent. If present, calls `sendViaSwarmBot(token, platform_id, thread_id, content, files)` directly via `fetch` to the Telegram Bot API. This makes the message appear with the agent's bot identity even though the polling bot is different.
   - **Per-bot adapter path** (`channel_type === 'telegram-<folder>'`): uses the registered ChannelAdapter for that channel, which already wraps the agent's bot. No swarm logic needed.
5. After successful deliver, calls `markDelivered(inDb, msg.id, platformMsgId)`.
6. **Race guard:** `inFlightMessages` Set ensures the active poller (1s) and sweep poller (60s) don't both deliver the same row before either marks it. Bug-fix from the swarm bring-up — slow HTTP send opens a window for the race.

### Sessions

- `messaging_group_agents.session_mode` controls how inbound messages map to sessions:
  - `'shared'` (default v2 behavior): one session per `(agent_group, messaging_group, thread)`. Each chat = its own session/history.
  - `'per-thread'`: one session per `(agent_group, messaging_group, thread)`. For `supportsThreads: true` channels (Telegram), each forum topic = its own session.
  - `'agent-shared'`: **one session per `agent_group`**, regardless of which messaging_group or thread the message arrived from. **All channels share the same conversation history for that agent.** This is what the swarm uses.
- Lookup: `findSessionByAgentGroup(agent_group_id)` returns the most recent active session for the agent. Subsequent inbounds (from any channel) reuse it.
- Implication: changing `session_mode` after sessions exist doesn't migrate them — but for `agent-shared`, the next inbound just attaches to whatever active session exists for that agent.

### Identity normalization

`src/router.ts` `extractAndUpsertUser`:
```typescript
const userKind = event.channelType.split('-')[0]; // 'telegram-lad' → 'telegram'
const userId = `${userKind}:${handle}`;
```
This keeps Jonas as one user (`telegram:8557164566`) across DM with `@zory_zr_bot`, DM with `@caio_zoryon_bot`, and the Creative_Lab group. One owner grant in `user_roles` covers all of them.

---

## Setup checklist

### One-time per swarm member (BotFather work)

1. `/newbot` → name + username (e.g., `caio_zoryon_bot`)
2. Receive token, save to a secure vault (you'll paste it later)
3. `/mybots` → `<bot>` → **Bot Settings**:
   - **Group Privacy** → **Turn off** for the **primary** (the polling bot — `@zory_zr_bot`). Required so it sees every group message.
   - For secondaries (Caio/Lad/Grow): privacy can stay ON (default). They only handle DMs anyway.
4. (Optional) Set avatar, description, commands.

### One-time per host install

1. Put the **primary** token in `.env`:
   ```
   TELEGRAM_BOT_TOKEN=<primary_bot_token>
   ```
2. Set the OneCLI Anthropic + any per-agent secrets:
   ```bash
   onecli secrets create --name OPENROUTER_API_KEY --type generic \
     --host-pattern openrouter.ai --header-name Authorization \
     --value 'Bearer sk-or-v1-...'
   ```
3. Register each agent in OneCLI (so secret injection knows about them):
   ```bash
   onecli agents create --name Lad  --identifier <ag-id-from-DB>
   onecli agents create --name Grow --identifier <ag-id-from-DB>
   onecli agents set-secrets --id <onecli-agent-uuid> \
     --secret-ids <anthropic-secret-id>,<other-needed-secret-ids>
   ```
   **All agents need the Anthropic secret** (id `9c80093e-...` in this install) or the container will retry-loop on every Claude call.

### Setting up a Creative_Lab–style shared group (with topics)

```bash
npx tsx scripts/activate-creative-lab.ts \
  --chat-id <supergroup_chat_id_with_minus_prefix> \
  --thread-id <topic_id_or_omit> \
  --caio-token <token> --lad-token <token> --grow-token <token> \
  --zory-token <primary_token_same_as_TELEGRAM_BOT_TOKEN> \
  --openrouter-secret-id <onecli_secret_id_for_grow>
```

What this does (idempotent):
- Creates `agent_groups` for Caio/Lad/Grow if missing (Zory must already exist via init-first-agent)
- Stores each agent's bot token in `container_config.telegramBotToken`
- Initializes the per-agent filesystem (`groups/<folder>/.claude-shared/`, etc.)
- Creates the `messaging_groups` row for the supergroup (`channel_type='telegram'`, `platform_id='telegram:<chat_id>'`)
- Wires all agents to that mg with prefix triggers (`@caio`, `@lad`, `@grow`, `@zory` — plus the bot @handles as alt-prefixes). Caio is the fallback (no triggers, priority 0)
- Sets up `agent_destinations` (Caio↔Lad↔Grow↔Caio) so they can talk to each other via agent-to-agent messages

**Manual Telegram steps after running the script:**
1. Add all bots (primary + 3 secondaries) to the group
2. Promote the primary to **admin** with `Manage Topics` permission
3. Restart the host so new container_configs and channel registrations take effect

### Setting up per-agent private DMs

```bash
npx tsx scripts/activate-private-dms.ts --operator-id <your_telegram_user_id>
```

What it does (idempotent):
- For each agent that has a `telegramBotToken` in container_config:
  - Creates a `messaging_groups` row for the DM (`channel_type='telegram-<folder>'`, `platform_id='telegram:<operator_user_id>'`)
  - Wires the agent to that mg as fallback (no triggers, priority 0, `session_mode='agent-shared'` so memory is unified)
- Prints `https://t.me/<bot_username>` links for each — open and `/start` to test

How to find your operator id: DM `@zory_zr_bot` once. The router auto-creates a messaging_group with `platform_id=telegram:<your_id>` — visible in the log as `Auto-created messaging group telegram:<id>`.

### Granting yourself owner access

The router's access gate uses normalized user kinds. You only need to grant ownership ONCE per platform:

```bash
# WhatsApp (already done in init-first-agent for the first DM)
# Telegram: a single grant covers all bots (DM and group, primary and secondaries)
node -e "..."  # or use the SQL pattern in scripts/_grant-tg-owner.mjs
```

Owner row pattern:
```sql
INSERT INTO user_roles (user_id, role, agent_group_id, granted_by, granted_at)
VALUES ('telegram:<your_user_id>', 'owner', NULL, NULL, '<now-iso>');
```

---

## Files involved

| File | Role |
|---|---|
| `src/channels/telegram.ts` | Adapter factory: registers primary + iterates `agent_groups` to register secondaries with `dmOnly` |
| `src/channels/chat-sdk-bridge.ts` | Bridge wrapper around `@chat-adapter/telegram`. Implements `dmOnly` mode; catch-all `onNewMessage` for forum topics |
| `src/channels/channel-registry.ts` | Map-based registry. `initChannelAdapters` iterates Map at startup; visits entries added during iteration |
| `src/router.ts` | `pickAgent` (sticky + trigger + fallback); `extractAndUpsertUser` normalizes `telegram-x` → `telegram` |
| `src/delivery.ts` | `deliverMessage` chooses swarm vs default; `sendViaSwarmBot` sends via per-agent token; `inFlightMessages` race guard |
| `src/db/agent-groups.ts` | Stores `container_config.telegramBotToken` per agent |
| `src/db/messaging-groups.ts` | Wirings (`messaging_group_agents`) including `session_mode`, `trigger_rules`, `priority` |
| `src/db/active-agent-routes.ts` | Sticky routing per `(messaging_group, user)` |
| `src/db/sessions.ts` | `findSessionByAgentGroup` for `agent-shared` lookup |
| `scripts/activate-creative-lab.ts` | Idempotent setup: agent_groups + container_configs + messaging_group + wirings + destinations for the shared group |
| `scripts/activate-private-dms.ts` | Idempotent setup: per-agent DM messaging_group + wiring with `agent-shared` |
| `docs/telegram-forum-topics.md` | Sub-doc on the chat-sdk subscription gotcha for forum topics |
| `docs/telegram-swarm.md` | This file |

---

## Adding a NEW agent to an existing swarm

1. **BotFather:** `/newbot` → save the token + the bot @username
2. **Create the agent_group** in NanoClaw (initial folder + CLAUDE.md + system-prompt)
3. **Store the token** in `agent_groups.container_config.telegramBotToken` (for the new agent)
4. **Register in OneCLI** + assign Anthropic secret:
   ```bash
   onecli agents create --name <NewAgent> --identifier <ag-id>
   onecli agents set-secrets --id <onecli-id> --secret-ids 9c80093e-...
   ```
5. **Add the new bot to existing groups** you want it in (Telegram UI). Privacy ON is fine for secondaries.
6. **Wire the new agent** to the relevant `messaging_groups` (manually or by extending the activation scripts):
   - In Creative_Lab group: with prefix triggers `@<agent>`, priority 10, `session_mode='agent-shared'`
   - In its own DM: re-run `activate-private-dms.ts` (auto-discovers the new agent via container_config)
7. **Restart the host.** The new bot's adapter is registered at startup via `registerSecondaryBots`.
8. (Optional, for agent-to-agent calls) Add `agent_destinations` rows so other agents can call this one.

## Adding a NEW shared group/topic

1. Create the group in Telegram (forum supergroup if you want topics)
2. Add all bots that should participate. Promote the primary to admin if it's a forum group.
3. Find the chat_id (any bot can `getMe` + `getUpdates` after a message; `getChat` works too)
4. Either re-run `activate-creative-lab.ts` against the new chat_id, or hand-craft equivalent rows:
   - `messaging_groups` row for the chat
   - `messaging_group_agents` rows for every agent that should respond there (with the right triggers + session_mode)
5. Send a message in the new group — first message in any new topic flows through `onNewMessage` (via the catch-all) and auto-subscribes that thread

---

## Operational notes

### When to restart the host

- After editing `src/channels/telegram.ts`, `src/channels/chat-sdk-bridge.ts`, `src/router.ts`, `src/delivery.ts` — host code, not picked up live
- After adding a new agent's token to `agent_groups.container_config.telegramBotToken` — `registerSecondaryBots` only runs once at startup
- After changing `TELEGRAM_BOT_TOKEN` in `.env` — primary adapter only reads it at factory time

### When to restart a container (not the host)

- After assigning a new OneCLI secret to an agent (the gateway caches per-container session). `docker kill <container_name>` — the host sweep respawns on next message.
- After running `buildAgentGroupImage` — the running container needs to die so the next spawn picks up the new image. Already handled inside the install_packages approval flow.

### When to rebuild the base container image

- After changing `container/Dockerfile` (e.g., adding `jq`, installing `image-gen` CLI). Run `./container/build.sh`. Per-agent images (built on top of the base when packages are added) inherit the changes only when next rebuilt.

---

## Troubleshooting

### Inbound silent — bot polls but no log in nanoclaw

Check in order:
1. **Primary bot privacy mode** in BotFather → must be OFF for the polling bot
2. **`getMe`** on the bot → confirm `can_read_all_group_messages: true`
3. **`getUpdates`** with nanoclaw stopped (`kill <pid>`, wait for respawn-loop pause): if updates show, nanoclaw is dropping them — check `chat-sdk-bridge.ts` handlers and the conversations Map
4. **Bot is in the chat** → `getChatMember?chat_id=<chat>&user_id=<bot_id>` should return `member` or `administrator`
5. **Forum topics:** the FIRST message in a new topic must either be a @mention OR the channel must already be registered in `messaging_groups` (the `onNewMessage` catch-all only fires for registered conversations). See `docs/telegram-forum-topics.md`.

### Wrong topic — reply lands in General

- `supportsThreads` must be `true` in `createChatSdkBridge` config (it is, post-fix)
- `parseThreadId` in `delivery.ts` must extract the topic id from the encoded thread (`chatId:topicId` format → topicId)
- Verify `msg.thread_id` in outbound.db is non-null and includes the topic id

### Duplicate sends — same message arrives twice

- Race between active (1s) and sweep (60s) pollers, or two near-simultaneous active iterations during a slow send
- Fix already applied: `inFlightMessages` Set guard in `delivery.ts` `deliverSessionMessages`
- Confirm the guard is in place if duplicates return

### "API retry (retryable: true)" loop in container logs

- The agent's OneCLI registration is missing the Anthropic secret. Assign:
  ```bash
  onecli agents set-secrets --id <onecli-agent-uuid> --secret-ids 9c80093e-109d-4f73-b778-f3374df7c104
  ```
- Then `docker kill <container>` to drop the cached gateway session. Next message respawns with the right injection.

### "MESSAGE DROPPED — unknown sender (strict policy)"

- The user_id namespace got composed wrong. Check `extractAndUpsertUser` in `router.ts` — should produce `telegram:<id>` not `telegram-<channel>:<id>`. Normalization fix is already in place.
- Or: you genuinely don't have an owner/admin/member grant for that user. Run the owner-grant SQL.

### Swarm secondary bot duplicate-routes group messages

- Confirm the secondary bridge has `dmOnly: true`. Without it, the secondary's `onNewMention` and `onNewMessage` handlers fire for group mentions/messages, duplicating the primary's routing.

### Chat-SDK Telegram polling Conflict error

- "Conflict: terminated by other getUpdates request" — two processes polling the same bot token. Only one nanoclaw instance can run at a time. Kill the duplicate.

---

## Why the architecture is what it is

| Decision | Why |
|---|---|
| Primary bot polls the group; secondaries don't | Telegram delivers each group update to every bot in the group. If all polled, every group message arrives N times → duplicate routing. Easier to delegate group ingestion to one bot and ignore the others' group views. |
| Secondaries DO poll for DMs | Telegram DMs are per-bot. `@caio_zoryon_bot`'s DM is invisible to `@zory_zr_bot`. So each bot must poll its own DM stream. |
| Per-agent identity stored in `container_config.telegramBotToken` | Reuses existing agent_group config; no new schema. |
| Swarm path bypasses chat-sdk for group sends | Chat-sdk wraps a single bot. Multi-bot identity dispatch is simpler at the delivery boundary (we have the agent context there). |
| Per-bot adapters used directly for DM sends | The adapter already wraps the right bot — chat-sdk's deliver path is fine. No swarm logic needed. |
| Channel type `telegram-<folder>` for secondaries | Lets `messaging_groups` distinguish each agent's DM (same operator user_id, different bots). |
| User kind normalization (`telegram-*` → `telegram`) | One Telegram user is one user, regardless of which bot they DM. ACL grants are platform-level, not bot-level. |
| `session_mode='agent-shared'` everywhere | Each agent has ONE conversation, accessible from any channel. Mirrors "Caio in WhatsApp" and "Caio in Telegram DM" being the same Caio with the same memory. |
| Dynamic registration of secondaries inside the primary factory | Avoids a separate "swarm config" file. Sources of truth: `.env` (primary token) + DB `agent_groups.container_config` (secondary tokens). |
