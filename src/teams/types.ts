/**
 * Types for Agent Team Management
 * Manages client teams, agents, and skills
 */

export interface ClientConfig {
  id: string;
  name: string;
  slug: string;
  telegramGroupId: string;
  telegramBotToken?: string; // Optional: dedicated bot per client
  createdAt: string;
  status: 'active' | 'paused' | 'archived';
  plan: 'starter' | 'professional' | 'enterprise';
  agents: AgentDefinition[];
  settings: ClientSettings;
}

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  triggerPattern: string;
  personality: string;
  skills: string[];
  documents: string[];
  telegramTopicId?: number; // Telegram forum topic for this agent
  model?: string;
  containerConfig?: {
    timeout?: number;
    additionalMounts?: Array<{
      hostPath: string;
      containerPath: string;
      readonly: boolean;
    }>;
  };
  status: 'active' | 'paused';
}

export interface ClientSettings {
  timezone: string;
  language: string;
  maxConcurrentAgents: number;
  allowedModels: string[];
  features: {
    scheduledTasks: boolean;
    webSearch: boolean;
    browserAutomation: boolean;
    fileSharing: boolean;
    imageVision: boolean;
    voiceTranscription: boolean;
  };
}

export interface TeamTemplate {
  name: string;
  description: string;
  agents: Omit<AgentDefinition, 'id'>[];
}

// Pre-built team templates for common use cases
export const TEAM_TEMPLATES: Record<string, TeamTemplate> = {
  'customer-support': {
    name: 'Suporte ao Cliente',
    description: 'Time de agentes para atendimento ao cliente',
    agents: [
      {
        name: 'Atendente',
        role: 'Primeiro contato e triagem',
        triggerPattern: '@atendente',
        personality: 'Cordial, objetivo e empático. Faz a triagem inicial e direciona para o especialista adequado.',
        skills: ['responder-perguntas', 'triagem', 'faq'],
        documents: ['faq.md', 'politicas.md'],
        status: 'active',
      },
      {
        name: 'Especialista Técnico',
        role: 'Suporte técnico avançado',
        triggerPattern: '@tecnico',
        personality: 'Técnico, detalhista e paciente. Resolve problemas complexos com explicações claras.',
        skills: ['diagnostico', 'troubleshooting', 'documentacao'],
        documents: ['manual-tecnico.md', 'troubleshooting.md'],
        status: 'active',
      },
      {
        name: 'Gerente',
        role: 'Supervisão e escalações',
        triggerPattern: '@gerente',
        personality: 'Profissional e resolutivo. Lida com escalações e decisões importantes.',
        skills: ['escalonamento', 'relatorios', 'metricas'],
        documents: ['sla.md', 'procedimentos-escalacao.md'],
        status: 'active',
      },
    ],
  },
  'sales': {
    name: 'Vendas',
    description: 'Time de agentes para processo de vendas',
    agents: [
      {
        name: 'SDR',
        role: 'Qualificação de leads',
        triggerPattern: '@sdr',
        personality: 'Proativo, curioso e persuasivo. Qualifica leads e agenda reuniões.',
        skills: ['qualificacao', 'agendamento', 'follow-up'],
        documents: ['perfil-cliente-ideal.md', 'scripts-qualificacao.md'],
        status: 'active',
      },
      {
        name: 'Closer',
        role: 'Fechamento de vendas',
        triggerPattern: '@closer',
        personality: 'Consultivo, confiante e orientado a resultados. Apresenta propostas e fecha negócios.',
        skills: ['proposta', 'negociacao', 'fechamento'],
        documents: ['tabela-precos.md', 'cases-sucesso.md', 'objecoes.md'],
        status: 'active',
      },
    ],
  },
  'content': {
    name: 'Produção de Conteúdo',
    description: 'Time de agentes para criação de conteúdo',
    agents: [
      {
        name: 'Redator',
        role: 'Criação de textos',
        triggerPattern: '@redator',
        personality: 'Criativo, versátil e atento ao tom de voz da marca.',
        skills: ['copywriting', 'seo', 'storytelling'],
        documents: ['guia-estilo.md', 'tom-de-voz.md', 'palavras-chave.md'],
        status: 'active',
      },
      {
        name: 'Estrategista',
        role: 'Planejamento de conteúdo',
        triggerPattern: '@estrategista',
        personality: 'Analítico, criativo e orientado por dados.',
        skills: ['calendario-editorial', 'analise-metricas', 'pesquisa-tendencias'],
        documents: ['persona.md', 'calendario.md', 'metricas.md'],
        status: 'active',
      },
    ],
  },
  'operations': {
    name: 'Operações',
    description: 'Time de agentes para operações internas',
    agents: [
      {
        name: 'Assistente Admin',
        role: 'Tarefas administrativas',
        triggerPattern: '@admin',
        personality: 'Organizado, preciso e eficiente. Gerencia tarefas rotineiras.',
        skills: ['agendamento', 'lembretes', 'organizacao'],
        documents: ['processos.md', 'contatos.md'],
        status: 'active',
      },
      {
        name: 'Analista de Dados',
        role: 'Análises e relatórios',
        triggerPattern: '@analista',
        personality: 'Metódico, objetivo e orientado por dados. Cria relatórios claros.',
        skills: ['analise-dados', 'relatorios', 'dashboards'],
        documents: ['fontes-dados.md', 'kpis.md'],
        status: 'active',
      },
    ],
  },
};
