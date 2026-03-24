/**
 * Group Registrar
 * Bridges client/agent configs with NanoClaw's group system.
 * Each active agent in an active client becomes a registered NanoClaw group.
 */

import { listClients, getClientsDir } from './client-manager.js';
import type { ClientConfig, AgentDefinition } from './types.js';
import { slugify } from './types.js';
import type { RegisteredGroup } from '../types.js';

/**
 * Build a valid NanoClaw group folder name for a client agent.
 * Must satisfy: /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
 */
export function teamGroupFolder(
  clientSlug: string,
  agentName: string,
): string {
  return `team-${clientSlug}-${slugify(agentName)}`.slice(0, 64);
}

export interface TeamGroupRegistration {
  jid: string;
  group: RegisteredGroup;
}

/**
 * Generate NanoClaw group registrations from all active clients.
 * Each agent in a client becomes a registered group.
 */
export function registerClientGroups(): TeamGroupRegistration[] {
  const clients = listClients().filter(
    (c: ClientConfig) => c.status === 'active',
  );
  const registrations: TeamGroupRegistration[] = [];

  for (const client of clients) {
    for (const agent of client.agents.filter(
      (a: AgentDefinition) => a.status === 'active',
    )) {
      registrations.push(agentToGroup(client, agent));
    }
  }

  return registrations;
}

/**
 * Convert a single agent definition to a NanoClaw group registration.
 */
function agentToGroup(
  client: ClientConfig,
  agent: AgentDefinition,
): TeamGroupRegistration {
  const clientsDir = getClientsDir();
  const folder = teamGroupFolder(client.slug, agent.name);

  // Determine JID based on Telegram topic or group
  const jid = agent.telegramTopicId
    ? `tg:${client.telegramGroupId}:${agent.telegramTopicId}`
    : `tg:${client.telegramGroupId}`;

  // Build additional mounts for agent's documents and skills
  const additionalMounts = [
    {
      hostPath: `${clientsDir}/${client.slug}/docs`,
      containerPath: 'client-docs',
      readonly: true,
    },
    {
      hostPath: `${clientsDir}/${client.slug}/skills`,
      containerPath: 'client-skills',
      readonly: true,
    },
  ];

  if (agent.containerConfig?.additionalMounts) {
    additionalMounts.push(...agent.containerConfig.additionalMounts);
  }

  return {
    jid,
    group: {
      name: `[${client.name}] ${agent.name}`,
      folder,
      trigger: agent.triggerPattern,
      added_at: new Date().toISOString(),
      requiresTrigger: true,
      isMain: false,
      containerConfig: {
        additionalMounts,
        timeout: agent.containerConfig?.timeout,
      },
    },
  };
}
