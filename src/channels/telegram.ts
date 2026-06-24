/**
 * Telegram channel adapter (v2) — uses Chat SDK bridge, with a pairing
 * interceptor wrapped around onInbound to verify chat ownership before
 * registration. See telegram-pairing.ts for the why.
 */
import { createTelegramAdapter } from '@chat-adapter/telegram';

import { readEnvFile } from '../env.js';
import { log } from '../log.js';
import { createMessagingGroup, getMessagingGroupByPlatform, updateMessagingGroup } from '../db/messaging-groups.js';
import { getDb } from '../db/connection.js';
import { grantRole, hasAnyOwner } from '../modules/permissions/db/user-roles.js';
import { upsertUser } from '../modules/permissions/db/users.js';
import { createChatSdkBridge, type ReplyContext } from './chat-sdk-bridge.js';
import { sanitizeTelegramLegacyMarkdown } from './telegram-markdown-sanitize.js';
import { registerChannelAdapter } from './channel-registry.js';
import type { ChannelAdapter, ChannelSetup, InboundMessage } from './adapter.js';
import { tryConsume } from './telegram-pairing.js';

/**
 * Retry a one-shot operation that can fail on transient network errors at
 * cold-start (DNS hiccups, brief upstream outages). Exponential backoff capped
 * at 5 attempts — if the network is truly down we surface it instead of
 * hanging the service indefinitely.
 */
async function withRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      const delay = Math.min(16000, 1000 * 2 ** (attempt - 1));
      log.warn('Telegram setup failed, retrying', { label, attempt, delayMs: delay, err });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractReplyContext(raw: Record<string, any>): ReplyContext | null {
  if (!raw.reply_to_message) return null;
  const reply = raw.reply_to_message;
  return {
    text: reply.text || reply.caption || '',
    sender: reply.from?.first_name || reply.from?.username || 'Unknown',
  };
}

/** Look up the bot username via Telegram getMe. Cached after first call. */
async function fetchBotUsername(token: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const json = (await res.json()) as { ok: boolean; result?: { username?: string } };
    return json.ok ? (json.result?.username ?? null) : null;
  } catch (err) {
    log.warn('Telegram getMe failed', { err });
    return null;
  }
}

function isGroupPlatformId(platformId: string): boolean {
  // platformId is "telegram:<chatId>". Negative chat IDs are groups/channels.
  const id = platformId.split(':').pop() ?? '';
  return id.startsWith('-');
}

interface InboundFields {
  text: string;
  authorUserId: string | null;
}

function readInboundFields(message: InboundMessage): InboundFields {
  if (message.kind !== 'chat-sdk' || !message.content || typeof message.content !== 'object') {
    return { text: '', authorUserId: null };
  }
  const c = message.content as { text?: string; author?: { userId?: string } };
  return { text: c.text ?? '', authorUserId: c.author?.userId ?? null };
}

/**
 * Build an onInbound interceptor that consumes pairing codes before they
 * reach the router. On match: records the chat + its paired user, promotes
 * the user to owner if the instance has no owner yet, and short-circuits.
 * On miss: forwards to the host.
 */
/**
 * Send a one-shot confirmation back to the paired chat. Best-effort — failures
 * are logged but never propagated, so a Telegram outage can't undo a successful
 * pairing or trigger the interceptor's fail-open path.
 */
async function sendPairingConfirmation(token: string, platformId: string): Promise<void> {
  const chatId = platformId.split(':').slice(1).join(':');
  if (!chatId) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: 'Pairing success! Head back to the NanoClaw installer to finish setup.',
      }),
    });
    if (!res.ok) {
      log.warn('Telegram pairing confirmation non-OK', { status: res.status });
    }
  } catch (err) {
    log.warn('Telegram pairing confirmation failed', { err });
  }
}

function createPairingInterceptor(
  botUsernamePromise: Promise<string | null>,
  hostOnInbound: ChannelSetup['onInbound'],
  token: string,
): ChannelSetup['onInbound'] {
  return async (platformId, threadId, message) => {
    try {
      const botUsername = await botUsernamePromise;
      if (!botUsername) {
        hostOnInbound(platformId, threadId, message);
        return;
      }
      const { text, authorUserId } = readInboundFields(message);
      if (!text) {
        hostOnInbound(platformId, threadId, message);
        return;
      }
      const consumed = await tryConsume({
        text,
        botUsername,
        platformId,
        isGroup: isGroupPlatformId(platformId),
        adminUserId: authorUserId,
      });
      if (!consumed) {
        hostOnInbound(platformId, threadId, message);
        return;
      }
      // Pairing matched — record the chat and short-circuit so the
      // code-bearing message never reaches an agent. Privilege is now a
      // property of the paired user, not the chat: upsert the user, and if
      // this instance has no owner yet, promote them to owner.
      const existing = getMessagingGroupByPlatform('telegram', platformId);
      if (existing) {
        updateMessagingGroup(existing.id, {
          is_group: consumed.consumed!.isGroup ? 1 : 0,
        });
      } else {
        createMessagingGroup({
          id: `mg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          channel_type: 'telegram',
          platform_id: platformId,
          name: consumed.consumed!.name,
          is_group: consumed.consumed!.isGroup ? 1 : 0,
          unknown_sender_policy: 'strict',
          created_at: new Date().toISOString(),
        });
      }

      const pairedUserId = `telegram:${consumed.consumed!.adminUserId}`;
      upsertUser({
        id: pairedUserId,
        kind: 'telegram',
        display_name: null,
        created_at: new Date().toISOString(),
      });

      let promotedToOwner = false;
      if (!hasAnyOwner()) {
        grantRole({
          user_id: pairedUserId,
          role: 'owner',
          agent_group_id: null,
          granted_by: null,
          granted_at: new Date().toISOString(),
        });
        promotedToOwner = true;
      }

      log.info('Telegram pairing accepted — chat registered', {
        platformId,
        pairedUser: pairedUserId,
        promotedToOwner,
        intent: consumed.intent,
      });

      await sendPairingConfirmation(token, platformId);
    } catch (err) {
      log.error('Telegram pairing interceptor error', { err });
      // Fail open: pass through so a pairing bug doesn't break normal traffic.
      hostOnInbound(platformId, threadId, message);
    }
  };
}

/**
 * Build a Telegram channel adapter for a single bot token.
 *
 * `channelType` is 'telegram' for the primary bot and 'telegram-<folder>' for
 * each swarm-secondary bot, so inbound messages route to the right agent group
 * (the messaging_groups + wirings in the DB carry these channel types). The
 * bridge defaults channelType to the underlying adapter's name ('telegram'), so
 * we override it here. `dmOnly` secondaries drop group messages — the shared
 * group is owned by the primary bot, so a secondary that also sits in the group
 * must not double-process.
 */
function buildTelegramAdapter(token: string, channelType: string, dmOnly: boolean): ChannelAdapter {
  const telegramAdapter = createTelegramAdapter({
    botToken: token,
    mode: 'polling',
  });

  // Plain-text fallback. Telegram's legacy `Markdown` parse mode rejects
  // malformed entities — most often a lone `_` or `*` inside a bare URL (e.g.
  // youtu.be/2T5wt22_Gpo), which sanitizeTelegramLegacyMarkdown can't strip
  // without corrupting the link. A rejected send is retried then dropped, so
  // the user just sees silence. On an entity-parse error, resend once as a
  // `{ raw }` payload: with no `markdown`/`card` key the adapter omits
  // parse_mode, so Telegram takes the literal text. A formatting glitch then
  // degrades to an unformatted-but-delivered message instead of nothing.
  // Cards (ask_question / send_card) hit the same parse mode, so fall back to
  // their `fallbackText` — buttons are lost, but the message still arrives.
  const originalPostMessage = telegramAdapter.postMessage.bind(telegramAdapter);
  telegramAdapter.postMessage = async (threadId, message) => {
    try {
      return await originalPostMessage(threadId, message);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const isEntityError = /can't (?:parse entities|find end of the entity)/i.test(detail);
      if (isEntityError && message && typeof message === 'object') {
        const m = message as unknown as Record<string, unknown>;
        let plain: Record<string, unknown> | null = null;
        if (typeof m.markdown === 'string') {
          // Chat message: keep other fields (e.g. files), swap markdown → raw.
          const { markdown, ...rest } = m;
          plain = { ...rest, raw: markdown };
        } else if (typeof m.fallbackText === 'string') {
          // Card payload: drop the card/buttons, deliver the plain fallback.
          plain = { raw: m.fallbackText };
        }
        if (plain) {
          log.warn('Telegram rejected markdown entities — resending as plain text', { channelType, detail });
          return await originalPostMessage(threadId, plain as unknown as Parameters<typeof originalPostMessage>[1]);
        }
      }
      throw err;
    }
  };

  const bridge = createChatSdkBridge({
    adapter: telegramAdapter,
    concurrency: 'concurrent',
    extractReplyContext,
    supportsThreads: false,
    transformOutboundText: sanitizeTelegramLegacyMarkdown,
    maxTextLength: 4000,
  });

  const botUsernamePromise = fetchBotUsername(token);

  const wrapped: ChannelAdapter = {
    ...bridge,
    channelType,
    resolveChannelName: async (platformId: string) => {
      const chatId = platformId.split(':').slice(1).join(':');
      if (!chatId) return null;
      try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId }),
        });
        const data = (await res.json()) as { ok?: boolean; result?: { title?: string } };
        return data.ok ? (data.result?.title ?? null) : null;
      } catch {
        return null;
      }
    },
    async setup(hostConfig: ChannelSetup) {
      const onInbound: ChannelSetup['onInbound'] = dmOnly
        ? (platformId, threadId, message) => {
            if (message.isGroup) return;
            return hostConfig.onInbound(platformId, threadId, message);
          }
        : hostConfig.onInbound;
      const intercepted: ChannelSetup = {
        ...hostConfig,
        onInbound: createPairingInterceptor(botUsernamePromise, onInbound, token),
      };
      return withRetry(() => bridge.setup(intercepted), 'bridge.setup');
    },
  };
  return wrapped;
}

/**
 * Multi-bot swarm support. Each agent group can have its own Telegram bot, with
 * the token stored in the legacy `agent_groups.container_config` JSON column
 * (`telegramBotToken`) — preserved across the v2.0.70 migration even though the
 * new schema's source of truth is the `container_configs` table. Register one
 * DM-only adapter per distinct secondary token under channel_type
 * 'telegram-<folder>'. Called inside the primary factory (after DB init); the
 * registry's Map iteration picks up entries added during the loop, so the
 * secondaries are instantiated in the same initChannelAdapters pass.
 */
function registerSecondaryBots(primaryToken: string): void {
  let rows: { id: string; folder: string; container_config: string | null }[];
  try {
    rows = getDb().prepare('SELECT id, folder, container_config FROM agent_groups').all() as {
      id: string;
      folder: string;
      container_config: string | null;
    }[];
  } catch (err) {
    // Fresh installs lack the legacy container_config column — no swarm to wire.
    log.warn('Telegram: could not query agent_groups for secondary bots', { err });
    return;
  }

  const seenTokens = new Set<string>([primaryToken]);
  for (const ag of rows) {
    if (!ag.container_config) continue;
    let cfg: { telegramBotToken?: unknown };
    try {
      cfg = JSON.parse(ag.container_config) as { telegramBotToken?: unknown };
    } catch {
      continue;
    }
    const token = typeof cfg.telegramBotToken === 'string' ? cfg.telegramBotToken : null;
    if (!token || seenTokens.has(token)) continue;
    seenTokens.add(token);

    const channelType = `telegram-${ag.folder}`;
    log.info('Registering secondary Telegram bot', { agentGroup: ag.id, folder: ag.folder, channelType });
    registerChannelAdapter(channelType, {
      factory: () => buildTelegramAdapter(token, channelType, /* dmOnly */ true),
    });
  }
}

registerChannelAdapter('telegram', {
  factory: () => {
    const env = readEnvFile(['TELEGRAM_BOT_TOKEN']);
    if (!env.TELEGRAM_BOT_TOKEN) return null;
    const token = env.TELEGRAM_BOT_TOKEN;
    // Discover & register swarm-secondary bots before returning the primary;
    // they get instantiated in the same initChannelAdapters loop iteration.
    registerSecondaryBots(token);
    return buildTelegramAdapter(token, 'telegram', /* dmOnly */ false);
  },
});
