/**
 * Activate per-agent private DM channels in Telegram.
 *
 * For each agent that has `container_config.telegramBotToken`, ensure:
 *  - A messaging_group exists for the DM with the operator (channel_type =
 *    'telegram-<folder>' for swarm secondaries; 'telegram' for the primary).
 *    platform_id = `telegram:<operator_user_id>`.
 *  - The agent is wired to its own DM messaging_group as the only fallback
 *    (no triggers, priority 0, session_mode='agent-shared' so memory is
 *    shared across all channels for that agent).
 *
 * Idempotent. Safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/activate-private-dms.ts --operator-id <telegram_user_id>
 *
 * The operator's Telegram user id is the chat_id of a 1:1 DM. For Jonas this
 * is `8557164566` (visible in the log when he first DMed @zory_zr_bot:
 * `Auto-created messaging group telegram:8557164566`).
 */
import path from 'path';

import { DATA_DIR } from '../src/config.js';
import { getAllAgentGroups } from '../src/db/agent-groups.js';
import { initDb, getDb } from '../src/db/connection.js';
import {
  createMessagingGroup,
  createMessagingGroupAgent,
  getMessagingGroupAgentByPair,
  getMessagingGroupByPlatform,
} from '../src/db/messaging-groups.js';
import { runMigrations } from '../src/db/migrations/index.js';
import { readEnvFile } from '../src/env.js';

const PRIMARY_CHANNEL = 'telegram';

interface Args {
  operatorId: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    switch (key) {
      case '--operator-id':
        out.operatorId = val;
        i++;
        break;
      case '--dry-run':
        out.dryRun = true;
        break;
    }
  }
  if (!out.operatorId) {
    console.error('Missing --operator-id <telegram_user_id>');
    process.exit(2);
  }
  return out as Args;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchBotUsername(token: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const json = (await res.json()) as { ok: boolean; result?: { username?: string } };
    return json.ok ? (json.result?.username ?? null) : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date().toISOString();

  initDb(path.join(DATA_DIR, 'v2.db'));
  runMigrations(getDb());

  const env = readEnvFile(['TELEGRAM_BOT_TOKEN']);
  const primaryToken = env.TELEGRAM_BOT_TOKEN;
  if (!primaryToken) {
    console.error('TELEGRAM_BOT_TOKEN not set in .env. The primary bot is required.');
    process.exit(2);
  }

  console.log(`→ Activating per-agent private DMs for operator telegram:${args.operatorId}`);
  if (args.dryRun) console.log('  [dry-run] no writes\n');

  const platformId = `telegram:${args.operatorId}`;
  const agents = getAllAgentGroups();

  const dmLinks: string[] = [];

  for (const ag of agents) {
    if (!ag.container_config) continue;
    let cfg: { telegramBotToken?: unknown };
    try {
      cfg = JSON.parse(ag.container_config) as { telegramBotToken?: unknown };
    } catch {
      continue;
    }
    const token = typeof cfg.telegramBotToken === 'string' ? cfg.telegramBotToken : null;
    if (!token) continue;

    const isPrimary = token === primaryToken;
    const channelType = isPrimary ? PRIMARY_CHANNEL : `telegram-${ag.folder}`;

    console.log(`\n• ${ag.name} (${ag.folder}) — channel: ${channelType}${isPrimary ? ' [primary]' : ''}`);

    // 1. Ensure messaging_group for this DM
    let mg = getMessagingGroupByPlatform(channelType, platformId);
    if (!mg) {
      const mgId = generateId('mg');
      console.log(`  • Creating messaging_group ${mgId}`);
      if (!args.dryRun) {
        createMessagingGroup({
          id: mgId,
          channel_type: channelType,
          platform_id: platformId,
          name: `${ag.name} DM`,
          is_group: 0,
          unknown_sender_policy: 'strict',
          created_at: now,
        });
        mg = getMessagingGroupByPlatform(channelType, platformId)!;
      } else {
        mg = {
          id: mgId,
          channel_type: channelType,
          platform_id: platformId,
          name: `${ag.name} DM`,
          is_group: 0,
          unknown_sender_policy: 'strict',
          created_at: now,
        };
      }
    } else {
      console.log(`  ✓ messaging_group exists: ${mg.id}`);
    }

    // 2. Wire agent → mg (priority 0, no triggers, agent-shared session)
    const existing = getMessagingGroupAgentByPair(mg.id, ag.id);
    if (existing) {
      const needsUpdate = existing.session_mode !== 'agent-shared' || existing.trigger_rules !== null;
      if (needsUpdate) {
        console.log(`  • Updating wiring: session_mode=agent-shared, no triggers`);
        if (!args.dryRun) {
          getDb()
            .prepare(
              `UPDATE messaging_group_agents SET trigger_rules=NULL, session_mode='agent-shared', priority=0 WHERE id=?`,
            )
            .run(existing.id);
        }
      } else {
        console.log(`  ✓ wiring already correct`);
      }
    } else {
      console.log(`  • Wiring ${ag.name} as fallback (agent-shared)`);
      if (!args.dryRun) {
        createMessagingGroupAgent({
          id: generateId('mga'),
          messaging_group_id: mg.id,
          agent_group_id: ag.id,
          trigger_rules: null,
          response_scope: 'all',
          session_mode: 'agent-shared',
          priority: 0,
          created_at: now,
        });
      }
    }

    // 3. Resolve bot username for the DM link
    const username = await fetchBotUsername(token);
    if (username) {
      dmLinks.push(`  ${ag.name} → https://t.me/${username}`);
    } else {
      dmLinks.push(`  ${ag.name} → (could not fetch username; check token)`);
    }
  }

  console.log(`\n=== DM links (open and send /start) ===`);
  for (const link of dmLinks) console.log(link);

  console.log(`\nDone.`);
  if (!args.dryRun) {
    console.log(`\nNext steps:`);
    console.log(`  1. Restart the NanoClaw service (the new telegram.ts registers all secondary bot adapters at startup).`);
    console.log(`  2. Open each DM link above and send /start. The first message wakes the agent's container; subsequent are fast.`);
  } else {
    console.log('(dry-run — rerun without --dry-run to apply)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
