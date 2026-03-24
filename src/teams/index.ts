/**
 * Agent Team Management - Public API
 */

export {
  listClients,
  getClient,
  createClient,
  addAgent,
  removeAgent,
  updateAgent,
  updateClientSettings,
  archiveClient,
  getClientsDir,
} from './client-manager.js';

export {
  ClientConfig,
  AgentDefinition,
  ClientSettings,
  TeamTemplate,
  TEAM_TEMPLATES,
  PLAN_AGENT_LIMITS,
  slugify,
} from './types.js';

export {
  registerClientGroups,
  teamGroupFolder,
} from './group-registrar.js';
export type { TeamGroupRegistration } from './group-registrar.js';
