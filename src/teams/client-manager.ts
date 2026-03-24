/**
 * Client Manager
 * Handles CRUD operations for client teams
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ClientConfig, AgentDefinition, ClientSettings, TEAM_TEMPLATES, PLAN_AGENT_LIMITS, slugify } from './types.js';

// Resolve relative to project root (works with both src/ and dist/)
const CLIENTS_DIR = path.resolve(process.cwd(), 'clients');

function generateId(): string {
  return crypto.randomUUID();
}

export function getClientsDir(): string {
  return CLIENTS_DIR;
}

export function listClients(): ClientConfig[] {
  if (!fs.existsSync(CLIENTS_DIR)) return [];

  return fs.readdirSync(CLIENTS_DIR)
    .filter(dir => !dir.startsWith('_') && !dir.startsWith('.'))
    .map(dir => {
      const configPath = path.join(CLIENTS_DIR, dir, 'config.json');
      if (!fs.existsSync(configPath)) return null;
      try {
        return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ClientConfig;
      } catch {
        return null;
      }
    })
    .filter((c): c is ClientConfig => c !== null);
}

export function getClient(slug: string): ClientConfig | null {
  const configPath = path.join(CLIENTS_DIR, slug, 'config.json');
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

export function createClient(options: {
  name: string;
  telegramGroupId: string;
  telegramBotToken?: string;
  plan?: ClientConfig['plan'];
  timezone?: string;
  language?: string;
  templateName?: string;
}): ClientConfig {
  const slug = slugify(options.name);
  const clientDir = path.join(CLIENTS_DIR, slug);

  if (fs.existsSync(clientDir)) {
    throw new Error(`Cliente "${options.name}" já existe (${slug})`);
  }

  const defaultSettings: ClientSettings = {
    timezone: options.timezone || 'America/Sao_Paulo',
    language: options.language || 'pt-BR',
    maxConcurrentAgents: 3,
    allowedModels: ['claude-sonnet-4-6'],
    features: {
      scheduledTasks: true,
      webSearch: true,
      browserAutomation: false,
      fileSharing: true,
      imageVision: true,
      voiceTranscription: false,
    },
  };

  // Apply template if specified
  let agents: AgentDefinition[] = [];
  if (options.templateName && TEAM_TEMPLATES[options.templateName]) {
    const template = TEAM_TEMPLATES[options.templateName];
    agents = template.agents.map((a: Omit<AgentDefinition, 'id'>) => ({
      ...a,
      id: generateId(),
    }));
  }

  const config: ClientConfig = {
    id: generateId(),
    name: options.name,
    slug,
    telegramGroupId: options.telegramGroupId,
    telegramBotToken: options.telegramBotToken,
    createdAt: new Date().toISOString(),
    status: 'active',
    plan: options.plan || 'starter',
    agents,
    settings: defaultSettings,
  };

  // Create directory structure
  fs.mkdirSync(clientDir, { recursive: true });
  fs.mkdirSync(path.join(clientDir, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(clientDir, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(clientDir, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(clientDir, 'logs'), { recursive: true });

  // Save config
  fs.writeFileSync(
    path.join(clientDir, 'config.json'),
    JSON.stringify(config, null, 2)
  );

  // Create CLAUDE.md (agent memory)
  const claudeMd = generateClaudeMd(config);
  fs.writeFileSync(path.join(clientDir, 'CLAUDE.md'), claudeMd);

  // Create agent-specific CLAUDE.md files
  for (const agent of agents) {
    const agentDir = path.join(clientDir, 'agents', slugify(agent.name));
    fs.mkdirSync(agentDir, { recursive: true });
    fs.writeFileSync(
      path.join(agentDir, 'CLAUDE.md'),
      generateAgentClaudeMd(agent, config)
    );
  }

  // Create default docs
  fs.writeFileSync(
    path.join(clientDir, 'docs', 'README.md'),
    `# Base de Conhecimento - ${config.name}\n\nAdicione documentos aqui para que os agentes possam consultá-los.\n\n## Estrutura\n\n- Coloque arquivos .md com informações da empresa\n- Os agentes terão acesso somente aos documentos listados em sua configuração\n- Use nomes descritivos: \`politica-devolucao.md\`, \`tabela-precos.md\`, etc.\n`
  );

  console.log(`✅ Cliente "${config.name}" criado em: ${clientDir}`);
  return config;
}

export function addAgent(
  clientSlug: string,
  agent: Omit<AgentDefinition, 'id'>
): AgentDefinition {
  const config = getClient(clientSlug);
  if (!config) throw new Error(`Cliente "${clientSlug}" não encontrado`);

  const limit = PLAN_AGENT_LIMITS[config.plan] ?? 2;
  if (config.agents.length >= limit) {
    throw new Error(
      `Limite de agentes atingido para o plano "${config.plan}" (max: ${limit})`
    );
  }

  const newAgent: AgentDefinition = {
    ...agent,
    id: generateId(),
  };

  config.agents.push(newAgent);
  saveConfig(config);

  // Create agent directory and memory
  const agentDir = path.join(CLIENTS_DIR, clientSlug, 'agents', slugify(agent.name));
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(
    path.join(agentDir, 'CLAUDE.md'),
    generateAgentClaudeMd(newAgent, config)
  );

  console.log(`✅ Agente "${agent.name}" adicionado ao cliente "${config.name}"`);
  return newAgent;
}

export function removeAgent(clientSlug: string, agentId: string): void {
  const config = getClient(clientSlug);
  if (!config) throw new Error(`Cliente "${clientSlug}" não encontrado`);

  const idx = config.agents.findIndex((a: AgentDefinition) => a.id === agentId);
  if (idx === -1) throw new Error(`Agente "${agentId}" não encontrado`);

  const agent = config.agents[idx];
  config.agents.splice(idx, 1);
  saveConfig(config);

  // Remove agent directory from disk
  const agentDir = path.join(CLIENTS_DIR, clientSlug, 'agents', slugify(agent.name));
  if (fs.existsSync(agentDir)) {
    fs.rmSync(agentDir, { recursive: true });
  }

  console.log(`✅ Agente "${agent.name}" removido do cliente "${config.name}"`);
}

export function updateAgent(
  clientSlug: string,
  agentId: string,
  updates: Partial<AgentDefinition>
): AgentDefinition {
  const config = getClient(clientSlug);
  if (!config) throw new Error(`Cliente "${clientSlug}" não encontrado`);

  const idx = config.agents.findIndex((a: AgentDefinition) => a.id === agentId);
  if (idx === -1) throw new Error(`Agente "${agentId}" não encontrado`);

  config.agents[idx] = { ...config.agents[idx], ...updates, id: agentId };
  saveConfig(config);

  // Update agent CLAUDE.md
  const agentDir = path.join(CLIENTS_DIR, clientSlug, 'agents', slugify(config.agents[idx].name));
  if (fs.existsSync(agentDir)) {
    fs.writeFileSync(
      path.join(agentDir, 'CLAUDE.md'),
      generateAgentClaudeMd(config.agents[idx], config)
    );
  }

  return config.agents[idx];
}

export function updateClientSettings(
  clientSlug: string,
  settings: Partial<ClientSettings>
): ClientConfig {
  const config = getClient(clientSlug);
  if (!config) throw new Error(`Cliente "${clientSlug}" não encontrado`);

  config.settings = { ...config.settings, ...settings };
  saveConfig(config);
  return config;
}

export function archiveClient(clientSlug: string): void {
  const config = getClient(clientSlug);
  if (!config) throw new Error(`Cliente "${clientSlug}" não encontrado`);

  config.status = 'archived';
  saveConfig(config);
  console.log(`📦 Cliente "${config.name}" arquivado`);
}

// --- Internal helpers ---

function saveConfig(config: ClientConfig): void {
  const configPath = path.join(CLIENTS_DIR, config.slug, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function generateClaudeMd(config: ClientConfig): string {
  return `# ${config.name}

## Informações do Cliente
- **Plano:** ${config.plan}
- **Telegram Group:** ${config.telegramGroupId}
- **Timezone:** ${config.settings.timezone}
- **Idioma:** ${config.settings.language}

## Agentes Disponíveis
${config.agents.map((a: AgentDefinition) => `- **${a.name}** (${a.triggerPattern}) - ${a.role}`).join('\n') || '_Nenhum agente configurado ainda_'}

## Instruções Gerais
- Sempre responda no idioma: ${config.settings.language}
- Fuso horário do cliente: ${config.settings.timezone}
- Consulte os documentos em \`docs/\` antes de responder perguntas sobre a empresa
- Cada agente deve seguir sua personalidade e escopo definidos

## Memória do Cliente
_Adicione informações importantes sobre o cliente abaixo:_

`;
}

function generateAgentClaudeMd(agent: AgentDefinition, config: ClientConfig): string {
  return `# ${agent.name}

## Papel
${agent.role}

## Personalidade
${agent.personality}

## Trigger
Responda quando mencionado com: \`${agent.triggerPattern}\`

## Skills
${agent.skills.map((s: string) => `- ${s}`).join('\n')}

## Documentos de Referência
${agent.documents.map((d: string) => `- \`docs/${d}\``).join('\n')}

## Contexto do Cliente
- **Cliente:** ${config.name}
- **Idioma:** ${config.settings.language}
- **Timezone:** ${config.settings.timezone}

## Memória do Agente
_Anotações e aprendizados específicos deste agente:_

`;
}
