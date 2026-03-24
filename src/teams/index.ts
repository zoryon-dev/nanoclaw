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
} from './client-manager';

export {
  ClientConfig,
  AgentDefinition,
  ClientSettings,
  TeamTemplate,
  TEAM_TEMPLATES,
} from './types';

export { registerClientGroups } from './group-registrar';
