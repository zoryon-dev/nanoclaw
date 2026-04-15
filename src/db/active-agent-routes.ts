import { getDb } from './connection.js';

export interface ActiveAgentRoute {
  messaging_group_id: string;
  user_id: string;
  agent_group_id: string;
  activated_at: string;
  updated_at: string;
}

/**
 * Returns the sticky route for (messaging_group, user), or null if none.
 * Does NOT check expiry — caller must compare `updated_at` against the
 * sticky timeout policy.
 */
export function getActiveRoute(messagingGroupId: string, userId: string): ActiveAgentRoute | null {
  const row = getDb()
    .prepare(
      `SELECT messaging_group_id, user_id, agent_group_id, activated_at, updated_at
       FROM active_agent_routes
       WHERE messaging_group_id = ? AND user_id = ?`,
    )
    .get(messagingGroupId, userId) as ActiveAgentRoute | undefined;
  return row ?? null;
}

/** Upsert: creates or refreshes the sticky route, bumping `updated_at`. */
export function setActiveRoute(
  messagingGroupId: string,
  userId: string,
  agentGroupId: string,
  now: string = new Date().toISOString(),
): void {
  getDb()
    .prepare(
      `INSERT INTO active_agent_routes (messaging_group_id, user_id, agent_group_id, activated_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(messaging_group_id, user_id) DO UPDATE SET
         agent_group_id = excluded.agent_group_id,
         updated_at     = excluded.updated_at,
         activated_at   = CASE
           WHEN active_agent_routes.agent_group_id = excluded.agent_group_id
             THEN active_agent_routes.activated_at
           ELSE excluded.activated_at
         END`,
    )
    .run(messagingGroupId, userId, agentGroupId, now, now);
}

/** Bump updated_at without changing the agent. Called on every matched message. */
export function touchActiveRoute(
  messagingGroupId: string,
  userId: string,
  now: string = new Date().toISOString(),
): void {
  getDb()
    .prepare(
      `UPDATE active_agent_routes
       SET updated_at = ?
       WHERE messaging_group_id = ? AND user_id = ?`,
    )
    .run(now, messagingGroupId, userId);
}

/** Clear the sticky route (explicit exit or agent-signaled exit). */
export function clearActiveRoute(messagingGroupId: string, userId: string): void {
  getDb()
    .prepare(`DELETE FROM active_agent_routes WHERE messaging_group_id = ? AND user_id = ?`)
    .run(messagingGroupId, userId);
}

/** Clear all sticky routes pointing at a given agent. Used when deactivating an agent_group. */
export function clearRoutesForAgent(agentGroupId: string): void {
  getDb().prepare(`DELETE FROM active_agent_routes WHERE agent_group_id = ?`).run(agentGroupId);
}

/**
 * Clear sticky routes scoped to a single (messaging_group, agent_group) pair.
 * Called from delivery when the agent signals end-of-session via the
 * `[CAIO-EXIT]` marker. Affects every user on that messaging group whose
 * sticky route pointed at this agent.
 */
export function clearRoutesForAgentInGroup(messagingGroupId: string, agentGroupId: string): number {
  const info = getDb()
    .prepare(
      `DELETE FROM active_agent_routes
       WHERE messaging_group_id = ? AND agent_group_id = ?`,
    )
    .run(messagingGroupId, agentGroupId);
  return Number(info.changes);
}
