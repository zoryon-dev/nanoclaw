# Telegram Forum Supergroups + Topics

> **For the full multi-agent / multi-bot architecture, see [`telegram-swarm.md`](./telegram-swarm.md).** This file covers only the chat-sdk subscription gotcha specific to forum topics.

## The problem

NanoClaw's Telegram channel uses Chat SDK's `@chat-adapter/telegram` which only forwards messages via three handlers:

| Handler | Fires for |
|---|---|
| `onDirectMessage` | DMs (1:1 with the bot) |
| `onSubscribedMessage` | Messages in threads that have been subscribed via `thread.subscribe()` |
| `onNewMention` | The first @mention of the bot in an unsubscribed thread (also auto-subscribes) |

**Every other message is silently dropped by Chat SDK** — including the first non-mention message in a brand-new forum-supergroup topic.

This is a problem for our use case:
- You create a Telegram supergroup with topics enabled
- You want each topic to host an agent group (or swarm)
- Users naturally type plain messages ("oi", "/start", "@caio faz X" without selecting the bot from autocomplete)
- Without an explicit @mention entity, Chat SDK never fires a handler → the message never reaches the router → no agent sees it
- Bot privacy mode being OFF and the bot being admin in the group are NOT enough — the gating happens above Telegram, inside Chat SDK

Symptoms of this trap:
- `getUpdates` on the bot returns `{ ok: true, result: [] }` (Chat SDK is consuming updates but dropping them silently)
- `pending_update_count: 0` in `getWebhookInfo`
- `chat-sdk:telegram` polling logs are silent
- Nothing in `logs/nanoclaw.log` for the messages you just sent
- DMs to the same bot work fine (they go through `onDirectMessage`)

## The fix

A catch-all handler in `src/channels/chat-sdk-bridge.ts` that forwards every unsubscribed message **for channels NanoClaw already knows about** (i.e., has a `messaging_groups` row), and auto-subscribes the thread so subsequent messages take the normal `onSubscribedMessage` path.

```typescript
chat.onNewMessage(/[\s\S]*/, async (thread, message) => {
  const channelId = adapter.channelIdFromThreadId(thread.id);
  if (!conversations.has(channelId)) return; // ignore unrelated chats
  setupConfig.onInbound(channelId, thread.id, await messageToInbound(message));
  await thread.subscribe();
});
```

The filter is deliberate. We only forward from channels with a registered `messaging_group` — otherwise the router would auto-create stray messaging groups every time the bot sees a message in an unrelated group. The result: forum topics behave like normal group chats once the operator has registered the chat (e.g., via `scripts/activate-creative-lab.ts`).

## Setup checklist for forum-supergroup-with-topics

1. **Create the bots** in @BotFather (one identity per agent in the swarm — see `scripts/activate-creative-lab.ts`).
2. **In @BotFather**, for the polling bot (the one whose token is `TELEGRAM_BOT_TOKEN` in `.env`): `/mybots` → `<bot>` → **Bot Settings** → **Group Privacy** → **Turn off**. This lets the polling bot see every message in the group, not only @mentions of itself.
3. **Add all bots to the group**, then **promote the polling bot to admin** with at least `Manage Topics` permission. Status `member` alone is not enough for some forum-permission flows.
4. **Run the activation script** with the chat ID:
   ```bash
   npx tsx scripts/activate-creative-lab.ts \
     --chat-id "<chat_id>" \
     --thread-id "<topic_thread_id>" \
     --caio-token "..." --lad-token "..." --grow-token "..." --zory-token "..." \
     --openrouter-secret-id "..."
   ```
   This creates the `messaging_groups` row that the `onNewMessage` filter checks against, plus all the wirings + agent-to-agent destinations.
5. **Restart the host** so chat-sdk-bridge picks up the new handler (if you are upgrading an existing install) and re-reads `messaging_groups` into the conversations map.
6. **Send the first message in the topic.** It will be forwarded + the topic will be subscribed. Future messages flow normally.

## Why we don't pre-subscribe known threads at startup

We could, by inserting rows into `chat_sdk_subscriptions` for each topic. But that requires:
- Knowing the encoded `thread_id` for each topic (`adapter.encodeThreadId({ chatId, messageThreadId })`)
- Storing topic IDs alongside `messaging_groups` (today only the chat ID is tracked)
- Running this on every new topic, not just the activation moment

The catch-all handler achieves the same result with zero extra schema or config — the first message in a new topic is the trigger. Tradeoff: that first message goes through `onNewMessage` instead of `onSubscribedMessage`, but the data delivered to the router is identical.

## Outbound (swarm identity) — separate concern

Per-agent bot identities (so Caio's replies appear as `@caio_zoryon_bot`, etc.) are handled by `delivery.ts`'s swarm path: each `agent_groups.container_config.telegramBotToken` is used to send via that bot's identity, bypassing the chat-sdk's single-bot adapter. The polling bot in `TELEGRAM_BOT_TOKEN` only handles inbound. See `src/delivery.ts` `sendViaSwarmBot`.
