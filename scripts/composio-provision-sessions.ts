/**
 * Provisions a Composio Tool Router session for each agent group in v2.db.
 *
 * For each group, creates a session keyed on `group.id` (the stable OneCLI
 * agent identifier) and writes `session.mcp.url` into
 * `container_config.mcpServers.composio` as a proxy-aware HTTP MCP server.
 *
 * Auth: the container calls backend.composio.dev through the OneCLI gateway,
 * which injects `x-api-key` via the "Composio Backend" vault secret. So the
 * session URL is persisted without any token — only the host-side SDK call
 * below needs the API key (read from env/.env, never persisted).
 *
 * Usage:
 *   COMPOSIO_API_KEY=ak_... npx tsx scripts/composio-provision-sessions.ts
 *   npx tsx scripts/composio-provision-sessions.ts --agent-group <id>
 *   npx tsx scripts/composio-provision-sessions.ts --dry-run
 */
import path from 'path';

import { Composio } from '@composio/core';

import { DATA_DIR } from '../src/config.js';
import { getAllAgentGroups, updateAgentGroup } from '../src/db/agent-groups.js';
import { initDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations/index.js';
import { readEnvFile } from '../src/env.js';

const envFile = readEnvFile(['COMPOSIO_API_KEY']);
const apiKey = process.env.COMPOSIO_API_KEY || envFile.COMPOSIO_API_KEY;

if (!apiKey) {
  console.error(
    'COMPOSIO_API_KEY not set. Export it for this run (or put in .env):\n' +
      '  COMPOSIO_API_KEY=ak_... npx tsx scripts/composio-provision-sessions.ts',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targetIdx = args.indexOf('--agent-group');
const targetId = targetIdx >= 0 ? args[targetIdx + 1] : null;

async function main(): Promise<void> {
  const dbPath = path.join(DATA_DIR, 'v2.db');
  const db = initDb(dbPath);
  runMigrations(db);

  const composio = new Composio({ apiKey });

  const groups = getAllAgentGroups();
  if (groups.length === 0) {
    console.log('No agent groups yet. Run /init-first-agent first.');
    return;
  }

  const targets = targetId ? groups.filter((g) => g.id === targetId) : groups;
  if (targets.length === 0) {
    console.error(`No agent group matched id=${targetId}`);
    process.exit(1);
  }

  for (const group of targets) {
    const existing = group.container_config ? JSON.parse(group.container_config) : {};
    // Optional overrides: container_config.composio.connectedAccounts maps
    // toolkit_slug → connected_account_id, letting an agent reuse a connection
    // that lives under a different user_id.
    const connectedAccounts = existing.composio?.connectedAccounts;

    process.stdout.write(`[${group.name}] (${group.id}) creating session`);
    if (connectedAccounts) process.stdout.write(` (overrides: ${Object.keys(connectedAccounts).join(',')})`);
    process.stdout.write('… ');

    const session = connectedAccounts
      ? await composio.create(group.id, { connectedAccounts })
      : await composio.create(group.id);
    const url = session.mcp.url;
    console.log(`ok → ${url}`);

    if (dryRun) continue;

    const merged = {
      ...existing,
      mcpServers: {
        ...(existing.mcpServers ?? {}),
        composio: { type: 'http', url },
      },
    };
    updateAgentGroup(group.id, { container_config: JSON.stringify(merged) });
    console.log(`  persisted mcpServers.composio for ${group.folder}`);
  }

  console.log('\nDone. Container calls to backend.composio.dev will be auth-injected by the OneCLI gateway.');
}

main().catch((err) => {
  console.error('Fatal:', err?.message ?? err);
  if (err?.response) console.error('Response:', err.response);
  process.exit(1);
});
