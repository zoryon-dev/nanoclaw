/**
 * Group Registrar
 * Bridges client/agent configs with NanoClaw's group system
 * Registers each agent as a NanoClaw group pointing to the correct Telegram chat/topic
 */

import * as path from 'path';
import { listClients, getClientsDir } from './client-manager.js';
import type { ClientConfig, AgentDefinition } from './types.js';
import { slugify } from './types.js';

interface GroupRegistration {
  jid: string;
  name: string;
  folder: string;
  triggerPattern: string;
  requiresTrigger: boolean;
  isMain: boolean;
  containerConfig?: {
    additionalMounts?: Array<{
      hostPath: string;
      containerPath: string;
      readonly: boolean;
    }>;
    timeout?: number;
  };
}

/**
 * Generate NanoClaw group registrations from all active clients
 * Each agent in a client becomes a registered group
 */
export function registerClientGroups(): GroupRegistration[] {
  const clients = listClients().filter((c: ClientConfig) => c.status === 'active');
  const registrations: GroupRegistration[] = [];

  for (const client of clients) {
    for (const agent of client.agents.filter((a: AgentDefinition) => a.status === 'active')) {
      registrations.push(agentToGroup(client, agent));
    }
  }

  return registrations;
}

/**
 * Convert a single agent definition to a NanoClaw group registration
 */
function agentToGroup(client: ClientConfig, agent: AgentDefinition): GroupRegistration {
  const clientsDir = getClientsDir();
  const groupFolder = path.join('clients', client.slug, 'agents', slugify(agent.name));

  // Determine JID based on Telegram topic or group
  const jid = agent.telegramTopicId
    ? `tg:${client.telegramGroupId}:${agent.telegramTopicId}`
    : `tg:${client.telegramGroupId}`;

  // Build additional mounts for agent's documents
  const docsDir = path.join(clientsDir, client.slug, 'docs');
  const skillsDir = path.join(clientsDir, client.slug, 'skills');

  const additionalMounts = [
    {
      hostPath: docsDir,
      containerPath: 'client-docs',
      readonly: true,
    },
    {
      hostPath: skillsDir,
      containerPath: 'client-skills',
      readonly: true,
    },
  ];

  if (agent.containerConfig?.additionalMounts) {
    additionalMounts.push(...agent.containerConfig.additionalMounts);
  }

  return {
    jid,
    name: `[${client.name}] ${agent.name}`,
    folder: groupFolder,
    triggerPattern: agent.triggerPattern,
    requiresTrigger: true,
    isMain: false,
    containerConfig: {
      additionalMounts,
      timeout: agent.containerConfig?.timeout,
    },
  };
}

