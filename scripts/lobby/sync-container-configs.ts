/**
 * One-off: sync container_configs DB rows from the reviewed container.json
 * files for the concierge refactor. The DB is the source of truth that
 * materializeContainerJson() rewrites the file from at spawn — so editing the
 * file alone is not enough. This upserts lobby (existing) and treino (new)
 * from their on-disk container.json so DB == file.
 *
 * Usage: npx tsx scripts/lobby/sync-container-configs.ts
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const db = new Database(path.join(ROOT, 'data', 'v2.db'));

const TARGETS = [
  { groupId: 'lobby', file: 'groups/lobby/container.json' },
  { groupId: 'fd35fc12-f373-479f-8ad6-817496abdba3', file: 'groups/treino/container.json' },
];

const now = new Date().toISOString();

const upsert = db.prepare(`
  INSERT INTO container_configs
    (agent_group_id, skills, mcp_servers, packages_apt, packages_npm, additional_mounts, assistant_name, cli_scope, updated_at)
  VALUES
    (@agent_group_id, @skills, @mcp_servers, @packages_apt, @packages_npm, @additional_mounts, @assistant_name, COALESCE((SELECT cli_scope FROM container_configs WHERE agent_group_id=@agent_group_id), 'group'), @updated_at)
  ON CONFLICT(agent_group_id) DO UPDATE SET
    skills=excluded.skills,
    mcp_servers=excluded.mcp_servers,
    packages_apt=excluded.packages_apt,
    packages_npm=excluded.packages_npm,
    additional_mounts=excluded.additional_mounts,
    assistant_name=excluded.assistant_name,
    updated_at=excluded.updated_at
`);

for (const t of TARGETS) {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, t.file), 'utf8'));
  upsert.run({
    agent_group_id: t.groupId,
    skills: JSON.stringify(cfg.skills),
    mcp_servers: JSON.stringify(cfg.mcpServers ?? {}),
    packages_apt: JSON.stringify(cfg.packages?.apt ?? []),
    packages_npm: JSON.stringify(cfg.packages?.npm ?? []),
    additional_mounts: JSON.stringify(cfg.additionalMounts ?? []),
    assistant_name: cfg.assistantName ?? null,
    updated_at: now,
  });
  console.log(`✓ upserted container_configs for ${t.groupId} (${Object.keys(cfg.mcpServers ?? {}).length} mcp, ${(cfg.additionalMounts ?? []).length} mounts)`);
}

db.close();
