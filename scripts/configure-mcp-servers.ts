/**
 * Configure the 8 MCP servers (Parallel, Fireflies, Composio, Firecrawl,
 * Mem, Todoist, QMD, Ollama) on all existing agent groups in v2.db.
 *
 * Idempotent: merges with any existing container_config.
 * Initializes v2.db with migrations if it doesn't exist.
 *
 * Usage: npx tsx scripts/configure-mcp-servers.ts [--agent-group <id>]
 */
import path from 'path';

import { DATA_DIR } from '../src/config.js';
import { initDb } from '../src/db/connection.js';
import { getAllAgentGroups, updateAgentGroup } from '../src/db/agent-groups.js';
import { runMigrations } from '../src/db/migrations/index.js';
import { readEnvFile } from '../src/env.js';

const ENV_KEYS = [
  'PARALLEL_API_KEY',
  'FIREFLIES_API_KEY',
  'FIRECRAWL_API_KEY',
  'MEM_API_KEY',
  'TODOIST_API_TOKEN',
];
const envFile = readEnvFile(ENV_KEYS);
for (const key of ENV_KEYS) {
  if (!process.env[key] && envFile[key]) process.env[key] = envFile[key];
}

type McpServer =
  | { command: string; args: string[]; env?: Record<string, string> }
  | { type: 'http'; url: string; headers?: Record<string, string> };

function buildMcpServers(): Record<string, McpServer> {
  const servers: Record<string, McpServer> = {};
  const env = process.env;

  if (env.PARALLEL_API_KEY) {
    servers['parallel-search'] = {
      type: 'http',
      url: 'https://search-mcp.parallel.ai/mcp',
      headers: { Authorization: `Bearer ${env.PARALLEL_API_KEY}` },
    };
    servers['parallel-task'] = {
      type: 'http',
      url: 'https://task-mcp.parallel.ai/mcp',
      headers: { Authorization: `Bearer ${env.PARALLEL_API_KEY}` },
    };
  }

  if (env.FIREFLIES_API_KEY) {
    servers['fireflies'] = {
      command: 'npx',
      args: ['-y', 'fireflies-mcp-server'],
      env: { FIREFLIES_API_KEY: env.FIREFLIES_API_KEY },
    };
  }

  servers['composio'] = {
    type: 'http',
    url: 'https://connect.composio.dev/mcp',
  };

  if (env.FIRECRAWL_API_KEY) {
    servers['firecrawl'] = {
      type: 'http',
      url: `https://mcp.firecrawl.dev/${env.FIRECRAWL_API_KEY}/v2/mcp`,
    };
  }

  if (env.MEM_API_KEY) {
    servers['mem'] = {
      type: 'http',
      url: 'https://mcp.mem.ai/mcp',
      headers: { Authorization: `Bearer ${env.MEM_API_KEY}` },
    };
  }

  if (env.TODOIST_API_TOKEN) {
    servers['todoist'] = {
      command: 'npx',
      args: ['-y', 'todoist-mcp'],
      env: { TODOIST_API_TOKEN: env.TODOIST_API_TOKEN },
    };
  }

  servers['qmd'] = {
    type: 'http',
    url: 'http://host.docker.internal:8182/mcp',
  };

  return servers;
}

function main(): void {
  const dbPath = path.join(DATA_DIR, 'v2.db');
  const db = initDb(dbPath);
  runMigrations(db);

  const servers = buildMcpServers();
  const names = Object.keys(servers);
  console.log(`Prepared ${names.length} MCP servers: ${names.join(', ')}`);

  const groups = getAllAgentGroups();
  if (groups.length === 0) {
    console.log('No agent groups yet. Run /init-first-agent first, then re-run this script.');
    return;
  }

  const targetId = process.argv.includes('--agent-group') ? process.argv[process.argv.indexOf('--agent-group') + 1] : null;
  const targets = targetId ? groups.filter((g) => g.id === targetId) : groups;

  for (const group of targets) {
    const existing = group.container_config ? JSON.parse(group.container_config) : {};
    const merged = { ...existing, mcpServers: { ...(existing.mcpServers ?? {}), ...servers } };
    updateAgentGroup(group.id, { container_config: JSON.stringify(merged) });
    console.log(`Updated ${group.name} (${group.id}) — ${names.length} MCP servers wired`);
  }
}

main();
