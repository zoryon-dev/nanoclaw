/**
 * Telegram channel adapter (v2) — uses Chat SDK bridge, with a pairing
 * interceptor wrapped around onInbound to verify chat ownership before
 * registration. See telegram-pairing.ts for the why.
 *
 * Multi-bot (swarm DM) support: the PRIMARY bot uses TELEGRAM_BOT_TOKEN env
 * and registers as channel_type='telegram' (full-featured: groups + DMs).
 * SECONDARY bots are discovered from `agent_groups.container_config.telegramBotToken`
 * and each registers as a separate channel with channel_type='telegram-<folder>'
 * and `dmOnly` mode (only forward 1:1 DMs — the primary handles all groups).
 * Result: each agent is reachable in its own private DM via its own bot
 * identity, while group routing stays consolidated through the primary.
 */
import { createTelegramAdapter } from '@chat-adapter/telegram';

import { getAllAgentGroups } from '../db/agent-groups.js';
import { readEnvFile } from '../env.js';
import { log } from '../log.js';
import { createMessagingGroup, getMessagingGroupByPlatform, updateMessagingGroup } from '../db/messaging-groups.js';
import { grantRole, hasAnyOwner } from '../db/user-roles.js';
import { upsertUser } from '../db/users.js';
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
function createPairingInterceptor(
  botUsernamePromise: Promise<string | null>,
  hostOnInbound: ChannelSetup['onInbound'],
): ChannelSetup['onInbound'] {
  return (platformId, threadId, message) => {
    void (async () => {
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
    })().catch((err) => {
      log.error('Telegram pairing interceptor error', { err });
      // Fail open: pass through so a pairing bug doesn't break normal traffic.
      hostOnInbound(platformId, threadId, message);
    });
  };
}

/**
 * Build a single Telegram bot ChannelAdapter. Used for both primary and
 * secondary bots; the only difference is `dmOnly` (secondaries don't handle
 * groups to avoid duplicate-routing messages the primary already sees).
 */
function createTelegramBotAdapter(token: string, channelType: string, dmOnly: boolean): ChannelAdapter {
  const telegramAdapter = createTelegramAdapter({
    botToken: token,
    mode: 'polling',
  });
  const bridge = createChatSdkBridge({
    adapter: telegramAdapter,
    concurrency: 'concurrent',
    extractReplyContext,
    // Forum-supergroup topics are first-class threads in Telegram.
    // supportsThreads=true preserves message_thread_id end-to-end so
    // (a) the router scopes sessions per topic (per-thread mode) and
    // (b) the swarm delivery path passes message_thread_id back to the
    // Bot API so replies land in the right topic, not General.
    supportsThreads: true,
    transformOutboundText: sanitizeTelegramLegacyMarkdown,
    dmOnly,
  });

  const botUsernamePromise = fetchBotUsername(token);

  return {
    ...bridge,
    name: channelType,
    channelType,
    async setup(hostConfig: ChannelSetup) {
      const intercepted: ChannelSetup = {
        ...hostConfig,
        onInbound: createPairingInterceptor(botUsernamePromise, hostConfig.onInbound),
      };
      return withRetry(() => bridge.setup(intercepted), `bridge.setup:${channelType}`);
    },
  };
}

/**
 * Discover swarm-secondary bot tokens stored in agent_groups.container_config
 * and register one ChannelAdapter per bot. Skips:
 * - The token equal to TELEGRAM_BOT_TOKEN (that's the primary).
 * - Agents with no token configured.
 *
 * Each secondary registers under channel_type='telegram-<folder>' so that
 * messaging_groups for per-bot DMs route correctly. Called once from the
 * primary factory; works because Map iteration in `initChannelAdapters`
 * picks up entries added during the loop.
 */
function registerSecondaryBots(primaryToken: string): void {
  let agentGroups: Awaited<ReturnType<typeof getAllAgentGroups>> = [];
  try {
    agentGroups = getAllAgentGroups();
  } catch (err) {
    log.warn('Telegram: could not query agent_groups for secondary bots', { err });
    return;
  }

  const seenTokens = new Set<string>([primaryToken]);
  for (const ag of agentGroups) {
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
      factory: () => createTelegramBotAdapter(token, channelType, /*dmOnly*/ true),
    });
  }
}

registerChannelAdapter('telegram', {
  factory: () => {
    const env = readEnvFile(['TELEGRAM_BOT_TOKEN']);
    if (!env.TELEGRAM_BOT_TOKEN) return null;
    const token = env.TELEGRAM_BOT_TOKEN;

    // Discover & register secondary bots (DM-only). They get instantiated by
    // initChannelAdapters in the same iteration loop right after this primary
    // (Map iteration visits entries added during iteration).
    registerSecondaryBots(token);

    return createTelegramBotAdapter(token, 'telegram', /*dmOnly*/ false);
  },
});
