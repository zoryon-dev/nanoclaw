/**
 * Unit tests for sticky agent routing (trigger_rules + active_agent_routes).
 *
 * Exercises `pickAgent` directly — the smallest surface that encodes the
 * routing decision. Integration path (routeInbound → pickAgent → session →
 * wake) is covered by host-core.test.ts.
 */
import fs from 'fs';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  closeDb,
  createAgentGroup,
  createMessagingGroup,
  createMessagingGroupAgent,
  initTestDb,
  runMigrations,
} from './db/index.js';
import {
  clearActiveRoute,
  clearRoutesForAgentInGroup,
  getActiveRoute,
  setActiveRoute,
} from './db/active-agent-routes.js';
import { pickAgent, STICKY_TIMEOUT_MS, extractText, matchesPrefix, isExitKeyword } from './router.js';
import type { InboundEvent } from './router.js';

vi.mock('./config.js', async () => {
  const actual = await vi.importActual('./config.js');
  return { ...actual, DATA_DIR: '/tmp/nanoclaw-test-sticky' };
});

const TEST_DIR = '/tmp/nanoclaw-test-sticky';

function now(): string {
  return new Date().toISOString();
}

function makeEvent(text: string): InboundEvent {
  return {
    channelType: 'whatsapp',
    platformId: 'wa-jonas',
    threadId: null,
    message: {
      id: `msg-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'chat',
      content: JSON.stringify({ text, sender: 'jonas', senderId: 'jonas' }),
      timestamp: now(),
    },
  };
}

beforeEach(() => {
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });

  const db = initTestDb();
  runMigrations(db);

  // Two agents: Zory (fallback, no triggers) + Caio (triggered by @caio).
  createAgentGroup({
    id: 'ag-zory',
    name: 'Zory',
    folder: 'dm-with-jonas',
    agent_provider: null,
    container_config: null,
    created_at: now(),
  });
  createAgentGroup({
    id: 'ag-caio',
    name: 'Caio',
    folder: 'content-machine',
    agent_provider: null,
    container_config: null,
    created_at: now(),
  });
  createMessagingGroup({
    id: 'mg-1',
    channel_type: 'whatsapp',
    platform_id: 'wa-jonas',
    name: 'DM Jonas',
    is_group: 0,
    unknown_sender_policy: 'public',
    created_at: now(),
  });
  createMessagingGroupAgent({
    id: 'mga-zory',
    messaging_group_id: 'mg-1',
    agent_group_id: 'ag-zory',
    trigger_rules: null, // fallback
    response_scope: 'all',
    session_mode: 'shared',
    priority: 0,
    created_at: now(),
  });
  createMessagingGroupAgent({
    id: 'mga-caio',
    messaging_group_id: 'mg-1',
    agent_group_id: 'ag-caio',
    trigger_rules: JSON.stringify({ prefixes: ['@caio', 'caio,'] }),
    response_scope: 'all',
    session_mode: 'shared',
    priority: 10,
    created_at: now(),
  });
});

afterEach(() => {
  closeDb();
  if (fs.existsSync(TEST_DIR)) fs.rmSync(TEST_DIR, { recursive: true });
});

describe('extractText', () => {
  it('extracts text field from chat JSON', () => {
    expect(extractText('{"text":"hello"}')).toBe('hello');
  });
  it('returns empty string when no text', () => {
    expect(extractText('{"sender":"x"}')).toBe('');
  });
  it('returns empty string on invalid JSON', () => {
    expect(extractText('not json')).toBe('');
  });
});

describe('matchesPrefix', () => {
  it('matches case-insensitive', () => {
    expect(matchesPrefix('@Caio faz X', ['@caio'])).toBe(true);
    expect(matchesPrefix('@CAIO FAZ X', ['@caio'])).toBe(true);
  });
  it('matches only at the start', () => {
    expect(matchesPrefix('oi @caio', ['@caio'])).toBe(false);
  });
  it('accepts multiple prefixes', () => {
    expect(matchesPrefix('caio, faz X', ['@caio', 'caio,'])).toBe(true);
  });
  it('trims leading whitespace', () => {
    expect(matchesPrefix('  @caio X', ['@caio'])).toBe(true);
  });
});

describe('isExitKeyword', () => {
  it('recognizes all default exact exits', () => {
    expect(isExitKeyword('sair')).toBe(true);
    expect(isExitKeyword('chega')).toBe(true);
    expect(isExitKeyword('valeu')).toBe(true);
    expect(isExitKeyword('obrigado caio')).toBe(true);
    expect(isExitKeyword('volta zory')).toBe(true);
  });
  it('recognizes @zory / zory, as prefix exits (switch-to-other-agent intent)', () => {
    expect(isExitKeyword('@zory')).toBe(true);
    expect(isExitKeyword('@zory me lembra disso')).toBe(true);
    expect(isExitKeyword('zory, posso te pedir algo?')).toBe(true);
  });
  it('matches case-insensitive and trims', () => {
    expect(isExitKeyword('  SAIR  ')).toBe(true);
    expect(isExitKeyword('Obrigado Caio')).toBe(true);
    expect(isExitKeyword('@ZORY me lembra')).toBe(true);
  });
  it('does not match longer messages containing exact keywords', () => {
    expect(isExitKeyword('sair era a ideia, mas continua')).toBe(false);
    expect(isExitKeyword('valeu pela ajuda, faz outro')).toBe(false);
  });
  it('does not match "zory" without the comma (so "zory é legal" stays with Caio)', () => {
    expect(isExitKeyword('zory é legal')).toBe(false);
    expect(isExitKeyword('zory faz algo')).toBe(false);
  });
  it('does not match unrelated content', () => {
    expect(isExitKeyword('oi')).toBe(false);
    expect(isExitKeyword('aprovado')).toBe(false);
  });
});

describe('pickAgent — no sticky route', () => {
  it('@caio prefix → picks Caio, creates sticky route', () => {
    const match = pickAgent('mg-1', 'whatsapp:jonas', makeEvent('@caio faz um carrossel'));
    expect(match?.agent_group_id).toBe('ag-caio');

    const route = getActiveRoute('mg-1', 'whatsapp:jonas');
    expect(route?.agent_group_id).toBe('ag-caio');
  });

  it('plain message with no prefix → picks Zory (fallback)', () => {
    const match = pickAgent('mg-1', 'whatsapp:jonas', makeEvent('como tá o dia?'));
    expect(match?.agent_group_id).toBe('ag-zory');

    // Fallback match does NOT create a sticky route (Zory is always the default)
    const route = getActiveRoute('mg-1', 'whatsapp:jonas');
    expect(route).toBeNull();
  });

  it('message starting with "caio," alt-prefix → picks Caio', () => {
    const match = pickAgent('mg-1', 'whatsapp:jonas', makeEvent('caio, faz X'));
    expect(match?.agent_group_id).toBe('ag-caio');
  });
});

describe('pickAgent — with sticky route', () => {
  it('sticky route on Caio → follow-up without prefix still picks Caio', () => {
    setActiveRoute('mg-1', 'whatsapp:jonas', 'ag-caio');

    const match = pickAgent('mg-1', 'whatsapp:jonas', makeEvent('1'));
    expect(match?.agent_group_id).toBe('ag-caio');
  });

  it('sticky route + exit keyword "sair" → clears route, falls back to Zory', () => {
    setActiveRoute('mg-1', 'whatsapp:jonas', 'ag-caio');

    const match = pickAgent('mg-1', 'whatsapp:jonas', makeEvent('sair'));
    expect(match?.agent_group_id).toBe('ag-zory');

    const route = getActiveRoute('mg-1', 'whatsapp:jonas');
    expect(route).toBeNull();
  });

  it('sticky route + "@zory" → clears route, falls back to Zory', () => {
    setActiveRoute('mg-1', 'whatsapp:jonas', 'ag-caio');

    const match = pickAgent('mg-1', 'whatsapp:jonas', makeEvent('@zory me lembra disso'));
    expect(match?.agent_group_id).toBe('ag-zory');
    expect(getActiveRoute('mg-1', 'whatsapp:jonas')).toBeNull();
  });

  it('sticky route older than STICKY_TIMEOUT_MS → expires, falls back', () => {
    const past = new Date(Date.now() - STICKY_TIMEOUT_MS - 60_000).toISOString();
    setActiveRoute('mg-1', 'whatsapp:jonas', 'ag-caio', past);

    const match = pickAgent('mg-1', 'whatsapp:jonas', makeEvent('1'));
    expect(match?.agent_group_id).toBe('ag-zory');

    // Expired route is cleared
    expect(getActiveRoute('mg-1', 'whatsapp:jonas')).toBeNull();
  });

  it('sticky route within timeout → stays sticky, updates touched timestamp', () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    setActiveRoute('mg-1', 'whatsapp:jonas', 'ag-caio', recent);

    pickAgent('mg-1', 'whatsapp:jonas', makeEvent('próximo'));

    const route = getActiveRoute('mg-1', 'whatsapp:jonas');
    expect(route?.agent_group_id).toBe('ag-caio');
    expect(route!.updated_at > recent).toBe(true);
  });

  it("user with no sticky route is unaffected by another user's route", () => {
    setActiveRoute('mg-1', 'whatsapp:jonas', 'ag-caio');

    const match = pickAgent('mg-1', 'whatsapp:other', makeEvent('oi'));
    expect(match?.agent_group_id).toBe('ag-zory');
  });
});

describe('pickAgent — no triggered agents (backward compatibility)', () => {
  beforeEach(() => {
    // Reset to old-world setup: only Zory wired, no triggers anywhere.
    clearActiveRoute('mg-1', 'whatsapp:jonas');
  });

  it('falls back to priority-ordered agent like v1 behavior', () => {
    // With only Zory + Caio, Caio has higher priority but has triggers.
    // Zory (fallback) still wins plain messages.
    const match = pickAgent('mg-1', 'whatsapp:jonas', makeEvent('oi'));
    expect(match?.agent_group_id).toBe('ag-zory');
  });
});

describe('pickAgent — anonymous user (no userId)', () => {
  it('still routes by prefix without creating sticky route', () => {
    const match = pickAgent('mg-1', null, makeEvent('@caio oi'));
    expect(match?.agent_group_id).toBe('ag-caio');
  });
  it('falls back to Zory for plain messages', () => {
    const match = pickAgent('mg-1', null, makeEvent('oi'));
    expect(match?.agent_group_id).toBe('ag-zory');
  });
});

describe('clearRoutesForAgentInGroup (exit marker hook)', () => {
  it('clears sticky route for the matching (mg, agent) pair', () => {
    setActiveRoute('mg-1', 'whatsapp:jonas', 'ag-caio');
    const count = clearRoutesForAgentInGroup('mg-1', 'ag-caio');
    expect(count).toBe(1);
    expect(getActiveRoute('mg-1', 'whatsapp:jonas')).toBeNull();
  });

  it('does not touch routes for a different agent in the same mg', () => {
    setActiveRoute('mg-1', 'whatsapp:jonas', 'ag-zory');
    const count = clearRoutesForAgentInGroup('mg-1', 'ag-caio');
    expect(count).toBe(0);
    expect(getActiveRoute('mg-1', 'whatsapp:jonas')?.agent_group_id).toBe('ag-zory');
  });
});
