/**
 * Activate the Creative_Lab Telegram swarm: Caio + Lad + Grow in one group.
 *
 * What this script does (all idempotent):
 *  1. Creates/reuses agent_groups for Caio (existing), Lad, Grow.
 *  2. Initializes filesystem for Lad + Grow.
 *  3. Stores each agent's Telegram bot token in container_config.telegramBotToken
 *     so delivery.ts picks the right identity at send time (swarm mode).
 *  4. Creates/reuses the Creative_Lab messaging_group (channel_type=telegram,
 *     platform_id=<chat_id>).
 *  5. Wires all 3 agents to that mg with trigger prefixes (@caio / @lad / @grow
 *     + bot handles as alt prefixes). Priority so that a @mention beats the
 *     generic fallback (Caio is the default fallback inside the Lab).
 *  6. Sets up agent_destinations for the triangular flow:
 *       caio → lad   (ask for a prompt)
 *       lad  → grow  (hand off the prompt — kept for future; currently Caio
 *                     generates images directly via image-gen after Lad returns
 *                     the prompt, but keeping the wiring doesn't hurt)
 *       grow → caio  (deliver the generated image back to Caio, if Grow is
 *                     used standalone)
 *  7. Assigns the OPENROUTER_API_KEY OneCLI secret to Grow (so image-gen works
 *     inside Grow's container).
 *
 * Usage:
 *   npx tsx scripts/activate-creative-lab.ts \
 *     --chat-id -1001234567890 \
 *     --caio-token "<caio bot token>" \
 *     --lad-token "<lad bot token>" \
 *     --grow-token "<grow bot token>" \
 *     [--openrouter-secret-id fad6c359-1999-4293-b0ec-d566ea4477e2] \
 *     [--dry-run]
 */
import { execSync } from 'child_process';
import path from 'path';

import { DATA_DIR } from '../src/config.js';
import { createDestination, getDestinationByTarget, normalizeName } from '../src/db/agent-destinations.js';
import { createAgentGroup, getAgentGroupByFolder, updateAgentGroup } from '../src/db/agent-groups.js';
import { initDb, getDb } from '../src/db/connection.js';
import {
  createMessagingGroup,
  createMessagingGroupAgent,
  getMessagingGroupAgentByPair,
  getMessagingGroupAgents,
  getMessagingGroupByPlatform,
} from '../src/db/messaging-groups.js';
import { runMigrations } from '../src/db/migrations/index.js';
import { initGroupFilesystem } from '../src/group-init.js';
import type { AgentGroup } from '../src/types.js';

const CAIO_FOLDER = 'content-machine';
const LAD_FOLDER = 'lad';
const GROW_FOLDER = 'grow';
const ZORY_FOLDER = 'dm-with-jonas';
const CHANNEL_TYPE = 'telegram';

interface Args {
  chatId: string;
  threadId: string | null;
  caioToken: string;
  ladToken: string;
  growToken: string;
  zoryToken: string | null;
  openrouterSecretId: string | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> = { dryRun: false, openrouterSecretId: null, threadId: null, zoryToken: null };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    const val = argv[i + 1];
    switch (key) {
      case '--chat-id':
        out.chatId = val;
        i++;
        break;
      case '--thread-id':
        out.threadId = val;
        i++;
        break;
      case '--caio-token':
        out.caioToken = val;
        i++;
        break;
      case '--lad-token':
        out.ladToken = val;
        i++;
        break;
      case '--grow-token':
        out.growToken = val;
        i++;
        break;
      case '--zory-token':
        out.zoryToken = val;
        i++;
        break;
      case '--openrouter-secret-id':
        out.openrouterSecretId = val;
        i++;
        break;
      case '--dry-run':
        out.dryRun = true;
        break;
    }
  }
  const required: (keyof Args)[] = ['chatId', 'caioToken', 'ladToken', 'growToken'];
  const missing = required.filter((k) => !out[k]);
  if (missing.length) {
    console.error(`Missing args: ${missing.map((k) => `--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}`).join(', ')}`);
    process.exit(2);
  }
  // Normalize chat_id: Telegram supergroup ids start with `-`. If the user
  // passed just digits (e.g., "1003793666825"), prepend the minus sign.
  if (out.chatId && !out.chatId.startsWith('-') && /^\d+$/.test(out.chatId)) {
    out.chatId = `-${out.chatId}`;
  }
  return out as Args;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function namespacedPlatformId(chatId: string): string {
  return chatId.startsWith(`${CHANNEL_TYPE}:`) ? chatId : `${CHANNEL_TYPE}:${chatId}`;
}

function ensureAgentGroup(folder: string, name: string, dry: boolean, now: string): AgentGroup {
  const existing = getAgentGroupByFolder(folder);
  if (existing) {
    console.log(`✓ Agent group exists: ${name} (${folder}) → ${existing.id}`);
    return existing;
  }
  const id = generateId('ag');
  console.log(`• Creating agent group: ${name} (${folder}) → ${id}`);
  if (!dry) {
    createAgentGroup({
      id,
      name,
      folder,
      agent_provider: null,
      container_config: null,
      created_at: now,
    });
  }
  return { id, name, folder, agent_provider: null, container_config: null, created_at: now };
}

function setSwarmToken(agentGroup: AgentGroup, token: string, dry: boolean): void {
  const cfg = agentGroup.container_config ? (JSON.parse(agentGroup.container_config) as Record<string, unknown>) : {};
  if (cfg.telegramBotToken === token) {
    console.log(`  ✓ telegramBotToken already set on ${agentGroup.name}`);
    return;
  }
  cfg.telegramBotToken = token;
  console.log(`  • Storing telegramBotToken for ${agentGroup.name}`);
  if (!dry) updateAgentGroup(agentGroup.id, { container_config: JSON.stringify(cfg) });
}

function wireAgent(
  mgId: string,
  agent: AgentGroup,
  triggerPrefixes: string[] | null,
  priority: number,
  dry: boolean,
  now: string,
): void {
  const existing = getMessagingGroupAgentByPair(mgId, agent.id);
  const targetRules = triggerPrefixes ? JSON.stringify({ prefixes: triggerPrefixes }) : null;
  if (existing) {
    const needsUpdate = existing.trigger_rules !== targetRules || existing.priority !== priority;
    if (needsUpdate) {
      console.log(`  • Updating wiring for ${agent.name}: priority=${priority} triggers=${targetRules ?? 'null'}`);
      if (!dry) {
        getDb()
          .prepare(`UPDATE messaging_group_agents SET trigger_rules = ?, priority = ? WHERE id = ?`)
          .run(targetRules, priority, existing.id);
      }
    } else {
      console.log(`  ✓ Wiring already correct for ${agent.name}`);
    }
    return;
  }
  console.log(`  • Wiring ${agent.name}: priority=${priority} triggers=${targetRules ?? 'null'}`);
  if (!dry) {
    createMessagingGroupAgent({
      id: generateId('mga'),
      messaging_group_id: mgId,
      agent_group_id: agent.id,
      trigger_rules: targetRules,
      response_scope: 'all',
      session_mode: 'shared',
      priority,
      created_at: now,
    });
  }
}

function ensureDestination(
  fromAgent: AgentGroup,
  toAgent: AgentGroup,
  localName: string,
  dry: boolean,
  now: string,
): void {
  const existing = getDestinationByTarget(fromAgent.id, 'agent', toAgent.id);
  if (existing) {
    console.log(`  ✓ ${fromAgent.name} → ${toAgent.name} (as "${existing.local_name}") already wired`);
    return;
  }
  console.log(`  • ${fromAgent.name} → ${toAgent.name} (as "${localName}")`);
  if (!dry) {
    createDestination({
      agent_group_id: fromAgent.id,
      local_name: normalizeName(localName),
      target_type: 'agent',
      target_id: toAgent.id,
      created_at: now,
    });
  }
}

function assignOpenRouterSecret(growId: string, secretId: string, dry: boolean): void {
  console.log(`• Assigning OPENROUTER_API_KEY secret to Grow via OneCLI`);
  if (dry) return;
  try {
    execSync(`onecli agents set-secrets --id ${growId} --secret-ids ${secretId}`, { stdio: 'inherit' });
  } catch (err) {
    console.warn(`  ⚠ Could not assign secret automatically: ${err instanceof Error ? err.message : err}`);
    console.warn(`    Run manually: onecli agents set-secrets --id ${growId} --secret-ids ${secretId}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date().toISOString();

  initDb(path.join(DATA_DIR, 'v2.db'));
  runMigrations(getDb());

  console.log(`→ Activating Creative_Lab swarm`);
  console.log(`  chat_id: ${args.chatId}`);
  if (args.dryRun) console.log(`  [dry-run] no writes will happen\n`);

  // 1. Agent groups
  const caio = ensureAgentGroup(CAIO_FOLDER, 'Caio', args.dryRun, now);
  const lad = ensureAgentGroup(LAD_FOLDER, 'Lad', args.dryRun, now);
  const grow = ensureAgentGroup(GROW_FOLDER, 'Grow', args.dryRun, now);
  const zory = getAgentGroupByFolder(ZORY_FOLDER);
  if (args.zoryToken && !zory) {
    console.error(`✗ Zory agent group not found at folder "${ZORY_FOLDER}". Skipping Zory wiring.`);
  }

  // 2. Filesystem for Lad + Grow (Caio + Zory already have one)
  if (!args.dryRun) {
    initGroupFilesystem(lad);
    initGroupFilesystem(grow);
  }

  // 3. Swarm tokens in container_config
  console.log(`\nConfiguring swarm tokens (delivery picks identity per agent):`);
  setSwarmToken(caio, args.caioToken, args.dryRun);
  setSwarmToken(lad, args.ladToken, args.dryRun);
  setSwarmToken(grow, args.growToken, args.dryRun);
  if (args.zoryToken && zory) setSwarmToken(zory, args.zoryToken, args.dryRun);

  // 4. Messaging group
  const platformId = namespacedPlatformId(args.chatId);
  let mg = getMessagingGroupByPlatform(CHANNEL_TYPE, platformId);
  if (!mg) {
    const mgId = generateId('mg');
    console.log(`\n• Creating messaging_group: ${mgId} (${CHANNEL_TYPE}/${platformId})`);
    if (!args.dryRun) {
      createMessagingGroup({
        id: mgId,
        channel_type: CHANNEL_TYPE,
        platform_id: platformId,
        name: 'Creative_Lab',
        is_group: 1,
        unknown_sender_policy: 'strict',
        created_at: now,
      });
      mg = getMessagingGroupByPlatform(CHANNEL_TYPE, platformId)!;
    } else {
      mg = {
        id: mgId,
        channel_type: CHANNEL_TYPE,
        platform_id: platformId,
        name: 'Creative_Lab',
        is_group: 1,
        unknown_sender_policy: 'strict',
        created_at: now,
      };
    }
  } else {
    console.log(`\n✓ messaging_group exists: ${mg.id}`);
  }

  // 5. Wirings — triggers per agent.
  // Caio is the default fallback inside the Lab (no triggers, priority 0) so
  // plain messages (approvals, "aprovado", "exportar", slide revisions) route
  // to him. Lad, Grow and Zory are triggered by mention.
  console.log(`\nWiring agents to ${mg.id}:`);
  wireAgent(mg.id, caio, null, 0, args.dryRun, now);
  wireAgent(
    mg.id,
    lad,
    ['@lad', '@lad_zoryon_bot', 'lad,'],
    10,
    args.dryRun,
    now,
  );
  wireAgent(
    mg.id,
    grow,
    ['@grow', '@grow_zoryon_bot', 'grow,'],
    10,
    args.dryRun,
    now,
  );
  if (zory) {
    wireAgent(
      mg.id,
      zory,
      ['@zory', '@zory_zr_bot', 'zory,'],
      10,
      args.dryRun,
      now,
    );
  }

  // 6. Agent destinations (agent-to-agent ACL + local name map)
  console.log(`\nAgent-to-agent destinations:`);
  ensureDestination(caio, lad, 'lad', args.dryRun, now);
  ensureDestination(caio, grow, 'grow', args.dryRun, now);
  ensureDestination(lad, grow, 'grow', args.dryRun, now);
  ensureDestination(lad, caio, 'caio', args.dryRun, now);
  ensureDestination(grow, caio, 'caio', args.dryRun, now);
  ensureDestination(grow, lad, 'lad', args.dryRun, now);
  if (zory) {
    ensureDestination(caio, zory, 'zory', args.dryRun, now);
    ensureDestination(zory, caio, 'caio', args.dryRun, now);
  }

  // 7. OpenRouter secret for Grow
  if (args.openrouterSecretId) {
    assignOpenRouterSecret(grow.id, args.openrouterSecretId, args.dryRun);
  } else {
    console.log(
      `\n⚠ No --openrouter-secret-id passed. Grow's image-gen won't work until you run:\n` +
        `    onecli agents set-secrets --id ${grow.id} --secret-ids <openrouter-secret-id>\n` +
        `  (the secret ID was printed when you created OPENROUTER_API_KEY via \`onecli secrets create\`)`,
    );
  }

  // Report
  console.log(`\n=== Final wiring on ${mg.id} ===`);
  const agents = getMessagingGroupAgents(mg.id);
  for (const a of agents) {
    const label =
      a.agent_group_id === caio.id
        ? 'CAIO'
        : a.agent_group_id === lad.id
          ? 'LAD'
          : a.agent_group_id === grow.id
            ? 'GROW'
            : zory && a.agent_group_id === zory.id
              ? 'ZORY'
              : '?';
    console.log(
      `  [${label}] priority=${a.priority} triggers=${a.trigger_rules ?? 'null'} agent=${a.agent_group_id}`,
    );
  }

  console.log(`\nDone.`);
  if (!args.dryRun) {
    console.log(`\nNext steps:`);
    console.log(`  1. Restart the NanoClaw service to pick up the new delivery-side swarm logic.`);
    console.log(`  2. Add the swarm identity bots (@caio_zoryon_bot, @lad_zoryon_bot, @grow_zoryon_bot${args.zoryToken ? ', @zory_zr_bot' : ''}) to the Creative_Lab group.`);
    console.log(`  3. Add the POLLING bot (@zoryclawbr_bot — the one already running) to the group. It's the invisible observer that routes inbound messages.`);
    console.log(`  4. In @BotFather, disable Group Privacy for @zoryclawbr_bot: /mybots → @zoryclawbr_bot → Bot Settings → Group Privacy → Turn off.`);
    console.log(`  5. Rebuild base container image (./container/build.sh) — picks up image-gen + jq for Grow.`);
    console.log(`  6. Test in the topic: send "oi" (plain → Caio responds) then "@lad gera um prompt pra um homem sentado".`);
  } else {
    console.log('(dry-run — rerun without --dry-run to apply)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
