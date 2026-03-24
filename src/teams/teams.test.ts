import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createClient,
  addAgent,
  removeAgent,
  updateAgent,
  listClients,
  getClient,
  updateClientSettings,
  archiveClient,
  getClientsDir,
} from './client-manager.js';
import {
  registerClientGroups,
  teamGroupFolder,
} from './group-registrar.js';
import { slugify, PLAN_AGENT_LIMITS } from './types.js';

// Use a temp directory for tests to avoid polluting the real project
const TEST_CWD = path.join(process.cwd(), '.test-teams-tmp');
const CLIENTS_DIR = path.join(TEST_CWD, 'clients');
const GROUPS_DIR = path.join(TEST_CWD, 'groups');

// Override process.cwd so client-manager resolves to our temp dirs
const originalCwd = process.cwd;

beforeEach(() => {
  fs.mkdirSync(CLIENTS_DIR, { recursive: true });
  fs.mkdirSync(GROUPS_DIR, { recursive: true });
  process.cwd = () => TEST_CWD;
});

afterEach(() => {
  process.cwd = originalCwd;
  if (fs.existsSync(TEST_CWD)) {
    fs.rmSync(TEST_CWD, { recursive: true });
  }
});

// --- slugify ---

describe('slugify', () => {
  it('converts names to url-safe slugs', () => {
    expect(slugify('Empresa Alpha')).toBe('empresa-alpha');
    expect(slugify('São Paulo Corp')).toBe('sao-paulo-corp');
    expect(slugify('  Spaces  ')).toBe('spaces');
    expect(slugify('UPPER CASE')).toBe('upper-case');
  });

  it('strips accents and special chars', () => {
    expect(slugify('Café & Résumé')).toBe('cafe-resume');
    expect(slugify('100% válido!')).toBe('100-valido');
  });

  it('handles edge cases', () => {
    expect(slugify('a')).toBe('a');
    expect(slugify('---')).toBe('');
  });
});

// --- teamGroupFolder ---

describe('teamGroupFolder', () => {
  it('produces a valid NanoClaw folder name', () => {
    const folder = teamGroupFolder('empresa-alpha', 'Atendente');
    expect(folder).toBe('team-empresa-alpha-atendente');
    // Must match NanoClaw folder pattern: ^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$
    expect(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(folder)).toBe(true);
  });

  it('truncates to 64 chars', () => {
    const long = 'a'.repeat(100);
    const folder = teamGroupFolder(long, 'agent');
    expect(folder.length).toBeLessThanOrEqual(64);
  });

  it('handles accented names', () => {
    const folder = teamGroupFolder('empresa', 'Técnico Sênior');
    expect(folder).toBe('team-empresa-tecnico-senior');
  });
});

// --- PLAN_AGENT_LIMITS ---

describe('PLAN_AGENT_LIMITS', () => {
  it('defines limits for all plan types', () => {
    expect(PLAN_AGENT_LIMITS['starter']).toBe(2);
    expect(PLAN_AGENT_LIMITS['professional']).toBe(5);
    expect(PLAN_AGENT_LIMITS['enterprise']).toBe(Infinity);
  });
});

// --- createClient ---

describe('createClient', () => {
  it('creates client with directory structure', () => {
    const config = createClient({
      name: 'Test Corp',
      telegramGroupId: '-100123',
    });

    expect(config.name).toBe('Test Corp');
    expect(config.slug).toBe('test-corp');
    expect(config.status).toBe('active');
    expect(config.plan).toBe('starter');
    expect(config.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );

    // Verify directory structure
    const clientDir = path.join(CLIENTS_DIR, 'test-corp');
    expect(fs.existsSync(clientDir)).toBe(true);
    expect(fs.existsSync(path.join(clientDir, 'config.json'))).toBe(true);
    expect(fs.existsSync(path.join(clientDir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(clientDir, 'agents'))).toBe(true);
    expect(fs.existsSync(path.join(clientDir, 'docs'))).toBe(true);
    expect(fs.existsSync(path.join(clientDir, 'skills'))).toBe(true);
    expect(fs.existsSync(path.join(clientDir, 'docs', 'README.md'))).toBe(
      true,
    );
  });

  it('applies template agents', () => {
    const config = createClient({
      name: 'Template Test',
      telegramGroupId: '-100456',
      templateName: 'customer-support',
      plan: 'professional',
    });

    expect(config.agents).toHaveLength(3);
    expect(config.agents[0].name).toBe('Atendente');
    expect(config.agents[1].name).toBe('Especialista Técnico');
    expect(config.agents[2].name).toBe('Gerente');

    // Each agent should have a UUID id
    for (const agent of config.agents) {
      expect(agent.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }

    // Agent CLAUDE.md should exist in both clients/ and groups/
    const agentClaudeMd = path.join(
      CLIENTS_DIR,
      'template-test',
      'agents',
      'atendente',
      'CLAUDE.md',
    );
    expect(fs.existsSync(agentClaudeMd)).toBe(true);

    const groupDir = path.join(
      GROUPS_DIR,
      teamGroupFolder('template-test', 'Atendente'),
    );
    expect(fs.existsSync(path.join(groupDir, 'CLAUDE.md'))).toBe(true);
    expect(fs.existsSync(path.join(groupDir, 'logs'))).toBe(true);
  });

  it('throws on duplicate client name', () => {
    createClient({ name: 'Dup Corp', telegramGroupId: '-100' });
    expect(() =>
      createClient({ name: 'Dup Corp', telegramGroupId: '-200' }),
    ).toThrow('já existe');
  });

  it('uses custom settings', () => {
    const config = createClient({
      name: 'Custom',
      telegramGroupId: '-100',
      timezone: 'Europe/London',
      language: 'en-US',
      plan: 'enterprise',
    });

    expect(config.settings.timezone).toBe('Europe/London');
    expect(config.settings.language).toBe('en-US');
    expect(config.plan).toBe('enterprise');
  });
});

// --- listClients / getClient ---

describe('listClients', () => {
  it('returns empty when no clients exist', () => {
    expect(listClients()).toEqual([]);
  });

  it('lists created clients', () => {
    createClient({ name: 'A Corp', telegramGroupId: '-1' });
    createClient({ name: 'B Corp', telegramGroupId: '-2' });

    const clients = listClients();
    expect(clients).toHaveLength(2);
    expect(clients.map((c) => c.slug).sort()).toEqual(['a-corp', 'b-corp']);
  });

  it('skips directories without config.json', () => {
    createClient({ name: 'Valid', telegramGroupId: '-1' });
    fs.mkdirSync(path.join(CLIENTS_DIR, 'no-config'), { recursive: true });

    expect(listClients()).toHaveLength(1);
  });
});

describe('getClient', () => {
  it('returns null for non-existent client', () => {
    expect(getClient('nope')).toBeNull();
  });

  it('returns client config', () => {
    createClient({ name: 'My Client', telegramGroupId: '-100' });
    const client = getClient('my-client');
    expect(client).not.toBeNull();
    expect(client!.name).toBe('My Client');
  });
});

// --- addAgent ---

describe('addAgent', () => {
  it('adds agent to existing client', () => {
    createClient({ name: 'AgentTest', telegramGroupId: '-100' });

    const agent = addAgent('agenttest', {
      name: 'Helper',
      role: 'General help',
      triggerPattern: '@helper',
      personality: 'Friendly',
      skills: ['faq'],
      documents: ['faq.md'],
      status: 'active',
    });

    expect(agent.name).toBe('Helper');
    expect(agent.id).toBeDefined();

    // Verify persisted
    const config = getClient('agenttest')!;
    expect(config.agents).toHaveLength(1);
    expect(config.agents[0].name).toBe('Helper');

    // Verify group folder created
    const groupDir = path.join(
      GROUPS_DIR,
      teamGroupFolder('agenttest', 'Helper'),
    );
    expect(fs.existsSync(path.join(groupDir, 'CLAUDE.md'))).toBe(true);
  });

  it('throws for non-existent client', () => {
    expect(() =>
      addAgent('nope', {
        name: 'X',
        role: 'X',
        triggerPattern: '@x',
        personality: 'X',
        skills: [],
        documents: [],
        status: 'active',
      }),
    ).toThrow('não encontrado');
  });

  it('enforces plan agent limits', () => {
    createClient({
      name: 'LimitTest',
      telegramGroupId: '-100',
      plan: 'starter',
    });

    const baseAgent = {
      role: 'Test',
      triggerPattern: '@t',
      personality: 'T',
      skills: [],
      documents: [],
      status: 'active' as const,
    };

    addAgent('limittest', { ...baseAgent, name: 'Agent1' });
    addAgent('limittest', { ...baseAgent, name: 'Agent2' });

    // Starter plan allows max 2
    expect(() =>
      addAgent('limittest', { ...baseAgent, name: 'Agent3' }),
    ).toThrow('Limite de agentes');
  });
});

// --- removeAgent ---

describe('removeAgent', () => {
  it('removes agent and cleans up directories', () => {
    createClient({ name: 'RemoveTest', telegramGroupId: '-100' });
    const agent = addAgent('removetest', {
      name: 'ToRemove',
      role: 'Temp',
      triggerPattern: '@temp',
      personality: 'Temp',
      skills: [],
      documents: [],
      status: 'active',
    });

    const agentDir = path.join(CLIENTS_DIR, 'removetest', 'agents', 'toremove');
    const groupDir = path.join(
      GROUPS_DIR,
      teamGroupFolder('removetest', 'ToRemove'),
    );
    expect(fs.existsSync(agentDir)).toBe(true);
    expect(fs.existsSync(groupDir)).toBe(true);

    removeAgent('removetest', agent.id);

    // Verify removed from config
    const config = getClient('removetest')!;
    expect(config.agents).toHaveLength(0);

    // Verify directories cleaned up
    expect(fs.existsSync(agentDir)).toBe(false);
    expect(fs.existsSync(groupDir)).toBe(false);
  });

  it('throws for non-existent agent', () => {
    createClient({ name: 'NoAgent', telegramGroupId: '-100' });
    expect(() => removeAgent('noagent', 'fake-id')).toThrow('não encontrado');
  });
});

// --- updateAgent ---

describe('updateAgent', () => {
  it('updates agent fields and CLAUDE.md', () => {
    createClient({ name: 'UpdateTest', telegramGroupId: '-100' });
    const agent = addAgent('updatetest', {
      name: 'Original',
      role: 'Old role',
      triggerPattern: '@original',
      personality: 'Old personality',
      skills: [],
      documents: [],
      status: 'active',
    });

    const updated = updateAgent('updatetest', agent.id, {
      personality: 'New personality',
      skills: ['new-skill'],
    });

    expect(updated.personality).toBe('New personality');
    expect(updated.skills).toEqual(['new-skill']);
    expect(updated.name).toBe('Original'); // unchanged

    // Verify persisted
    const config = getClient('updatetest')!;
    expect(config.agents[0].personality).toBe('New personality');
  });
});

// --- updateClientSettings ---

describe('updateClientSettings', () => {
  it('merges settings', () => {
    createClient({ name: 'Settings', telegramGroupId: '-100' });
    const updated = updateClientSettings('settings', {
      timezone: 'UTC',
    });

    expect(updated.settings.timezone).toBe('UTC');
    expect(updated.settings.language).toBe('pt-BR'); // unchanged default
  });
});

// --- archiveClient ---

describe('archiveClient', () => {
  it('sets status to archived', () => {
    createClient({ name: 'Archive', telegramGroupId: '-100' });
    archiveClient('archive');

    const config = getClient('archive')!;
    expect(config.status).toBe('archived');
  });
});

// --- registerClientGroups ---

describe('registerClientGroups', () => {
  it('returns empty when no clients exist', () => {
    expect(registerClientGroups()).toEqual([]);
  });

  it('generates registrations for active agents', () => {
    createClient({
      name: 'RegTest',
      telegramGroupId: '-100999',
      templateName: 'sales',
      plan: 'professional',
    });

    const registrations = registerClientGroups();
    expect(registrations).toHaveLength(2);

    const sdr = registrations.find((r) => r.group.name.includes('SDR'));
    expect(sdr).toBeDefined();
    expect(sdr!.jid).toBe('tg:-100999');
    expect(sdr!.group.trigger).toBe('@sdr');
    expect(sdr!.group.requiresTrigger).toBe(true);
    expect(sdr!.group.isMain).toBe(false);
    expect(sdr!.group.folder).toBe('team-regtest-sdr');
    // Folder must be valid for NanoClaw
    expect(
      /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(sdr!.group.folder),
    ).toBe(true);

    // Should include doc/skill mounts
    const mounts = sdr!.group.containerConfig?.additionalMounts;
    expect(mounts).toBeDefined();
    expect(mounts!.length).toBeGreaterThanOrEqual(2);
    expect(mounts![0].containerPath).toBe('client-docs');
    expect(mounts![0].readonly).toBe(true);
  });

  it('skips archived clients', () => {
    createClient({ name: 'Active', telegramGroupId: '-1' });
    createClient({ name: 'Archived', telegramGroupId: '-2' });
    archiveClient('archived');

    const registrations = registerClientGroups();
    // "Active" has 0 agents (no template), "Archived" is skipped
    expect(registrations).toHaveLength(0);
  });

  it('uses topic-based JID when telegramTopicId is set', () => {
    createClient({ name: 'TopicTest', telegramGroupId: '-100555' });
    addAgent('topictest', {
      name: 'Topical',
      role: 'Test',
      triggerPattern: '@topical',
      personality: 'Test',
      skills: [],
      documents: [],
      telegramTopicId: 42,
      status: 'active',
    });

    const registrations = registerClientGroups();
    expect(registrations).toHaveLength(1);
    expect(registrations[0].jid).toBe('tg:-100555:42');
  });
});
