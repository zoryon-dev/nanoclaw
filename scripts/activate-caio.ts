/**
 * Activate the Caio specialist agent.
 *
 * Creates the `Caio` agent_group pointing at `groups/content-machine/`,
 * wires it to every messaging_group that already routes to Zory (same DM,
 * but with trigger_rules so "@caio" / "caio," bring Caio up), and primes
 * filesystem + MCP servers.
 *
 * Idempotent — re-running adjusts existing rows to the target state
 * without creating duplicates.
 *
 * Usage:
 *   npx tsx scripts/activate-caio.ts
 *
 * Optional flags:
 *   --zory-folder <folder>    default: dm-with-jonas
 *   --caio-folder <folder>    default: content-machine
 *   --caio-name   <name>      default: Caio
 *   --priority    <n>         default: 10
 *   --dry-run                 show plan without writing
 */
import path from 'path';

import { DATA_DIR } from '../src/config.js';
import { createAgentGroup, getAgentGroupByFolder, updateAgentGroup } from '../src/db/agent-groups.js';
import { initDb, getDb } from '../src/db/connection.js';
import {
  createMessagingGroupAgent,
  getMessagingGroupAgentByPair,
  getMessagingGroupAgents,
} from '../src/db/messaging-groups.js';
import { runMigrations } from '../src/db/migrations/index.js';
import { initGroupFilesystem } from '../src/group-init.js';
import type { MessagingGroupAgent } from '../src/types.js';

interface Args {
  zoryFolder: string;
  caioFolder: string;
  caioName: string;
  priority: number;
  dryRun: boolean;
  skipWiring: boolean;
}

const CAIO_TRIGGER_RULES = JSON.stringify({ prefixes: ['@caio', 'caio,'] });

function parseArgs(argv: string[]): Args {
  const out: Args = {
    zoryFolder: 'dm-with-jonas',
    caioFolder: 'content-machine',
    caioName: 'Caio',
    priority: 10,
    dryRun: false,
    skipWiring: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    switch (key) {
      case '--zory-folder':
        out.zoryFolder = argv[++i];
        break;
      case '--caio-folder':
        out.caioFolder = argv[++i];
        break;
      case '--caio-name':
        out.caioName = argv[++i];
        break;
      case '--priority':
        out.priority = Number(argv[++i]);
        break;
      case '--dry-run':
        out.dryRun = true;
        break;
      case '--skip-wiring':
        out.skipWiring = true;
        break;
    }
  }
  return out;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const now = new Date().toISOString();

  initDb(path.join(DATA_DIR, 'v2.db'));
  runMigrations(getDb());

  console.log(`→ Activating ${args.caioName} (folder: ${args.caioFolder})`);
  if (args.dryRun) console.log('  [dry-run] no writes will happen\n');

  // 1. Verify Zory exists — we need her messaging_groups to co-locate Caio.
  const zory = getAgentGroupByFolder(args.zoryFolder);
  if (!zory) {
    console.error(`✗ Zory agent_group not found at folder "${args.zoryFolder}".`);
    console.error('  Run `npx tsx scripts/init-first-agent.ts ...` first.');
    process.exit(2);
  }
  console.log(`✓ Found Zory: ${zory.id} (${zory.folder})`);

  const zoryWirings = getDb()
    .prepare(
      `SELECT mga.*
       FROM messaging_group_agents mga
       WHERE mga.agent_group_id = ?`,
    )
    .all(zory.id) as MessagingGroupAgent[];

  if (zoryWirings.length === 0) {
    console.error(`✗ Zory has no messaging_group wirings. Nowhere to co-locate Caio.`);
    process.exit(2);
  }
  console.log(`  Zory is wired to ${zoryWirings.length} messaging_group(s).`);

  // 2. Create or reuse Caio agent_group.
  let caio = getAgentGroupByFolder(args.caioFolder);
  if (!caio) {
    const caioId = generateId('ag');
    console.log(`• Creating agent_group Caio (id: ${caioId})`);
    if (!args.dryRun) {
      createAgentGroup({
        id: caioId,
        name: args.caioName,
        folder: args.caioFolder,
        agent_provider: null,
        container_config: null,
        created_at: now,
      });
      caio = getAgentGroupByFolder(args.caioFolder)!;
    } else {
      caio = {
        id: caioId,
        name: args.caioName,
        folder: args.caioFolder,
        agent_provider: null,
        container_config: null,
        created_at: now,
      };
    }
  } else {
    console.log(`✓ Caio agent_group already exists: ${caio.id}`);
    if (caio.name !== args.caioName) {
      console.log(`  Updating name: "${caio.name}" → "${args.caioName}"`);
      if (!args.dryRun) {
        updateAgentGroup(caio.id, { name: args.caioName });
      }
    }
  }

  // 3. Initialize filesystem (idempotent). Skip in dry-run.
  if (!args.dryRun) {
    initGroupFilesystem(caio);
    console.log(`✓ Initialized filesystem for ${caio.folder}/`);
  }

  if (args.skipWiring) {
    console.log('\n--skip-wiring set: not creating any messaging_group_agents rows.');
    console.log('Agent group + filesystem are ready. Restart the host service, then rerun');
    console.log('this script WITHOUT --skip-wiring to create the prefix-triggered wiring.');
    return;
  }

  // 4. Wire Caio into every messaging_group Zory is in, with prefix triggers.
  for (const zoryWiring of zoryWirings) {
    const mgId = zoryWiring.messaging_group_id;
    const existing = getMessagingGroupAgentByPair(mgId, caio.id);

    if (existing) {
      // Adjust trigger/priority if they drifted.
      const needsUpdate =
        existing.trigger_rules !== CAIO_TRIGGER_RULES || existing.priority !== args.priority;
      if (needsUpdate) {
        console.log(`• Updating Caio wiring on ${mgId}: trigger/priority`);
        if (!args.dryRun) {
          getDb()
            .prepare(
              `UPDATE messaging_group_agents
               SET trigger_rules = ?, priority = ?
               WHERE id = ?`,
            )
            .run(CAIO_TRIGGER_RULES, args.priority, existing.id);
        }
      } else {
        console.log(`✓ Caio already wired on ${mgId} with correct config`);
      }
    } else {
      const mgaId = generateId('mga');
      console.log(`• Wiring Caio to ${mgId} (priority ${args.priority}, triggers ${CAIO_TRIGGER_RULES})`);
      if (!args.dryRun) {
        createMessagingGroupAgent({
          id: mgaId,
          messaging_group_id: mgId,
          agent_group_id: caio.id,
          trigger_rules: CAIO_TRIGGER_RULES,
          response_scope: 'all',
          session_mode: 'shared',
          priority: args.priority,
          created_at: now,
        });
      }
    }

    // Verify Zory's wiring is still fallback (null triggers, priority lower than Caio's).
    if (zoryWiring.trigger_rules !== null) {
      console.log(
        `  ⚠ Zory on ${mgId} has non-null trigger_rules. Leaving untouched — ` +
          `you may want her to stay as fallback (trigger_rules=null).`,
      );
    }
    if (zoryWiring.priority >= args.priority) {
      console.log(
        `  ⚠ Zory priority (${zoryWiring.priority}) ≥ Caio priority (${args.priority}) on ${mgId}. ` +
          `Triggered agents still take precedence via prefix match, but lowering Zory to 0 is cleaner.`,
      );
    }
  }

  // 5. Print resulting wirings for the operator to sanity-check.
  console.log('\n=== Final wirings ===');
  for (const zoryWiring of zoryWirings) {
    const mgId = zoryWiring.messaging_group_id;
    const agents = getMessagingGroupAgents(mgId);
    console.log(`\n  messaging_group: ${mgId}`);
    for (const a of agents) {
      const role = a.agent_group_id === caio.id ? 'CAIO' : a.agent_group_id === zory.id ? 'ZORY' : '???';
      console.log(
        `    [${role}] priority=${a.priority} triggers=${a.trigger_rules ?? 'null'} agent=${a.agent_group_id}`,
      );
    }
  }

  console.log('\nDone.');
  if (args.dryRun) {
    console.log('(dry-run — rerun without --dry-run to apply)');
  } else {
    console.log('Next steps:');
    console.log('  1. npx tsx scripts/configure-mcp-servers.ts --agent-group ' + caio.id);
    console.log('  2. Send "@caio oi" from WhatsApp to test the route.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
