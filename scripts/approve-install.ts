/**
 * Approve a pending install_packages request on the Jonas side.
 *
 * Replicates what handleApprovalResponse does for action='install_packages':
 * merge packages into the agent_group container_config, rebuild the image,
 * kill the current container so the sweep respawns on the new image, and
 * drop a follow-up system message into the session.
 *
 * Usage: npx tsx scripts/approve-install.ts <approval_id>
 */
import path from 'path';

import { DATA_DIR } from '../src/config.js';
import { getAgentGroup, updateAgentGroup } from '../src/db/agent-groups.js';
import { initDb, getDb } from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrations/index.js';
import { deletePendingApproval } from '../src/db/sessions.js';
import { getSession } from '../src/db/sessions.js';
import { buildAgentGroupImage, killContainer } from '../src/container-runner.js';
import { writeSessionMessage } from '../src/session-manager.js';
import { log } from '../src/log.js';

async function main(): Promise<void> {
  const approvalId = process.argv[2];
  if (!approvalId) {
    console.error('Usage: npx tsx scripts/approve-install.ts <approval_id>');
    process.exit(2);
  }

  initDb(path.join(DATA_DIR, 'v2.db'));
  runMigrations(getDb());

  const approval = getDb()
    .prepare(`SELECT * FROM pending_approvals WHERE approval_id = ?`)
    .get(approvalId) as
    | {
        approval_id: string;
        session_id: string;
        action: string;
        payload: string;
      }
    | undefined;

  if (!approval) {
    console.error(`✗ Approval ${approvalId} not found`);
    process.exit(2);
  }
  if (approval.action !== 'install_packages') {
    console.error(`✗ This script only handles install_packages (got ${approval.action})`);
    process.exit(2);
  }

  const session = getSession(approval.session_id);
  if (!session) {
    console.error(`✗ Session ${approval.session_id} not found`);
    process.exit(2);
  }
  const agentGroup = getAgentGroup(session.agent_group_id);
  if (!agentGroup) {
    console.error(`✗ Agent group ${session.agent_group_id} not found`);
    process.exit(2);
  }

  const payload = JSON.parse(approval.payload) as { apt?: string[]; npm?: string[] };
  console.log(`→ Approving ${approvalId}`);
  console.log(`  agent: ${agentGroup.name} (${agentGroup.folder})`);
  console.log(`  apt:   ${(payload.apt ?? []).join(', ') || '(none)'}`);
  console.log(`  npm:   ${(payload.npm ?? []).join(', ') || '(none)'}`);

  // 1. Merge packages into container_config
  const containerConfig: { packages?: { apt: string[]; npm: string[] } } = agentGroup.container_config
    ? JSON.parse(agentGroup.container_config)
    : {};
  if (!containerConfig.packages) containerConfig.packages = { apt: [], npm: [] };
  if (payload.apt) containerConfig.packages.apt.push(...payload.apt);
  if (payload.npm) containerConfig.packages.npm.push(...payload.npm);
  updateAgentGroup(agentGroup.id, { container_config: JSON.stringify(containerConfig) });
  console.log(`✓ Config updated (total apt=${containerConfig.packages.apt.length}, npm=${containerConfig.packages.npm.length})`);

  // 2. Rebuild image
  console.log(`• Rebuilding container image for ${agentGroup.folder}…`);
  try {
    await buildAgentGroupImage(agentGroup.id);
    console.log(`✓ Image rebuilt`);
  } catch (err) {
    console.error(`✗ Build failed:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }

  // 3. Kill container so sweep respawns on new image
  killContainer(session.id, 'rebuild applied (manual approval)');
  console.log(`✓ Container killed — sweep will respawn on new image`);

  // 4. Drop a follow-up system message in Caio's session so he knows install is done
  const pkgs = [...(payload.apt ?? []), ...(payload.npm ?? [])].join(', ');
  writeSessionMessage(session.agent_group_id, session.id, {
    id: `appr-note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: 'chat',
    timestamp: new Date().toISOString(),
    platformId: session.agent_group_id,
    channelType: 'agent',
    threadId: null,
    content: JSON.stringify({
      text: `Packages installed (${pkgs}) and container rebuilt. Verify and continue the carousel.`,
      sender: 'system',
      senderId: 'system',
    }),
  });
  console.log(`✓ Follow-up system message staged in session`);

  // 5. Clear the pending approval
  deletePendingApproval(approvalId);
  console.log(`✓ Pending approval cleared`);

  log.info('Manual approval applied', { approvalId, action: approval.action, agentGroup: agentGroup.id });
  console.log(`\nDone. Caio should respawn within the next sweep cycle and continue the carousel flow.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
