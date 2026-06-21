/**
 * One-off: apply concierge improvements A/B + shared-wiki mounts to the DB
 * (source of truth that materializeContainerJson rewrites from at spawn).
 *
 *  - Lobby: curate skills -> [watch, wiki, onecli-gateway] (drops noise +
 *    the wrong-platform whatsapp-formatting fragment).
 *  - Naia/Finance/Treino: mount Lobby's wiki read-only at /workspace/extra/wiki
 *    (shared living wiki; Lobby is sole writer). Idempotent.
 *  - Naia: drop the dangling mount to groups/lili (deleted agent).
 *
 * Usage: npx tsx scripts/lobby/apply-improvements.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

const ROOT = process.cwd();
const db = new Database(path.join(ROOT, 'data', 'v2.db'));
const now = new Date().toISOString();

const NAIA = 'ag-1778017244671-myb1ap';
const TREINO = 'fd35fc12-f373-479f-8ad6-817496abdba3';

// containerPath is prefixed with /workspace/extra/ by mount-security, so
// "wiki" -> /workspace/extra/wiki (NOT "extra/wiki", which would double it).
const WIKI_MOUNT = {
  hostPath: '/root/nanoclaw/groups/lobby/wiki',
  containerPath: 'wiki',
  readonly: true,
};

function getMounts(id: string): Array<{ hostPath: string; containerPath: string; readonly: boolean }> {
  const row = db.prepare('SELECT additional_mounts FROM container_configs WHERE agent_group_id = ?').get(id) as
    | { additional_mounts: string }
    | undefined;
  if (!row) throw new Error(`no container_configs row for ${id}`);
  return JSON.parse(row.additional_mounts);
}

function setMounts(id: string, mounts: unknown): void {
  db.prepare('UPDATE container_configs SET additional_mounts = ?, updated_at = ? WHERE agent_group_id = ?').run(
    JSON.stringify(mounts),
    now,
    id,
  );
}

function addWikiMount(id: string, opts: { dropLili?: boolean } = {}): void {
  let mounts = getMounts(id);
  if (opts.dropLili) mounts = mounts.filter((m) => !m.hostPath.endsWith('/groups/lili'));
  // idempotent: drop any existing wiki mount (correct or earlier wrong path), then add fresh
  mounts = mounts.filter((m) => m.containerPath !== 'wiki' && m.containerPath !== 'extra/wiki');
  mounts.push(WIKI_MOUNT);
  setMounts(id, mounts);
  console.log(`✓ ${id}: mounts -> ${mounts.map((m) => m.containerPath).join(', ')}`);
}

// A + B — curate Lobby skills
db.prepare('UPDATE container_configs SET skills = ?, updated_at = ? WHERE agent_group_id = ?').run(
  JSON.stringify(['watch', 'wiki', 'onecli-gateway']),
  now,
  'lobby',
);
const lobbySkills = (db.prepare("SELECT skills FROM container_configs WHERE agent_group_id='lobby'").get() as { skills: string }).skills;
console.log(`✓ lobby: skills -> ${lobbySkills}`);

// Shared wiki mounts (+ Naia lili-mount cleanup)
addWikiMount(NAIA, { dropLili: true });
addWikiMount('finance');
addWikiMount(TREINO);

db.close();
