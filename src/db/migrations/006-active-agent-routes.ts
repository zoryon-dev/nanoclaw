import type Database from 'better-sqlite3';

import type { Migration } from './index.js';

/**
 * Sticky agent routing: per (messaging_group, user), which agent owns the
 * conversation right now.
 *
 * Used by router.pickAgent to keep the same agent answering follow-up
 * messages after the user triggered it (e.g. "@caio …" then plain replies
 * like "1", "aprovado", "exportar" stay routed to Caio without re-tagging).
 *
 * Cleared by:
 *  - Explicit exit keyword from the user (sair, @zory, chega, …)
 *  - Agent output containing the literal marker `[CAIO-EXIT]` (delivery hook)
 *  - Lazy expiry when `updated_at` is older than the sticky timeout (10 min)
 */
export const migration006: Migration = {
  version: 6,
  name: 'active-agent-routes',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE active_agent_routes (
        messaging_group_id TEXT NOT NULL,
        user_id            TEXT NOT NULL,
        agent_group_id     TEXT NOT NULL REFERENCES agent_groups(id),
        activated_at       TEXT NOT NULL,
        updated_at         TEXT NOT NULL,
        PRIMARY KEY (messaging_group_id, user_id)
      );
      CREATE INDEX idx_active_routes_agent ON active_agent_routes(agent_group_id);
      CREATE INDEX idx_active_routes_updated ON active_agent_routes(updated_at);
    `);
  },
};
