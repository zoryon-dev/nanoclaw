import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../lib/reconcile.mjs';

const cache = {
  version: 1,
  patterns: [
    { match: 'uber trip', categoria: 'Pessoal', subcategoria: 'Transporte', hit_count: 10, last_seen: '2026-05-01' },
  ],
};

function canonical(linhas) {
  return {
    banco: 'btg_pf', conta_inferida: 'BTG D', escopo: 'PF',
    periodo: { inicio: '2026-05-01', fim: '2026-05-31' },
    linhas,
  };
}

function linha(over) {
  return {
    linha_id: 'btg_pf-2026-05-05-001',
    data: '2026-05-05',
    valor: 80,
    tipo: 'despesa',
    descricao_raw: 'UBER',
    banco_tx_id: null,
    meio_pagamento_hint: 'Cartão',
    categoria_hint: null,
    ...over,
  };
}

test('matched: exact valor + ±1 day + same tipo', () => {
  const csv = canonical([linha({})]);
  const sheet = {
    lancamentos: [{ id: 'lan-abc123', data: '2026-05-05', tipo: 'despesa', valor: 80, categoria: 'Pessoal', descricao: 'Uber', recorrente_id: '' }],
    recorrentes_ativos: [],
    recebiveis_esperados: [],
  };
  const r = reconcile(csv, sheet, cache, null, new Set());
  assert.equal(r.summary.matched, 1);
  assert.equal(r.matched[0].lan_id, 'lan-abc123');
  assert.equal(r.summary.to_add, 0);
});

test('candidato_recorrente: valor + dia tolerance + name fuzz', () => {
  const csv = canonical([linha({ valor: 55.9, descricao_raw: 'NETFLIX.COM', data: '2026-05-03', linha_id: 'btg_pf-2026-05-03-001' })]);
  const sheet = {
    lancamentos: [],
    recorrentes_ativos: [{ id: 'rec-net001', codigo: 'PES-STR-001', nome: 'Netflix', valor: 55.9, dia_do_mes: 3, pago_no_mes: false }],
    recebiveis_esperados: [],
  };
  const r = reconcile(csv, sheet, cache, null, new Set());
  assert.equal(r.summary.candidato_recorrente, 1);
  assert.equal(r.candidato_recorrente[0].recorrente_id, 'rec-net001');
  assert.equal(r.candidato_recorrente[0].action, 'marcar_pago');
});

test('candidato_recorrente skipped when pago_no_mes already true', () => {
  const csv = canonical([linha({ valor: 55.9, descricao_raw: 'NETFLIX.COM', data: '2026-05-03', linha_id: 'btg_pf-2026-05-03-001' })]);
  const sheet = {
    lancamentos: [],
    recorrentes_ativos: [{ id: 'rec-net001', codigo: 'PES-STR-001', nome: 'Netflix', valor: 55.9, dia_do_mes: 3, pago_no_mes: true }],
    recebiveis_esperados: [],
  };
  const r = reconcile(csv, sheet, cache, null, new Set());
  assert.equal(r.summary.candidato_recorrente, 0);
  assert.equal(r.summary.to_add, 1);
});

test('candidato_recebivel: receita matches Recebíveis pendente', () => {
  const csv = canonical([linha({ tipo: 'receita', valor: 2300, descricao_raw: 'HOTMART', data: '2026-05-06', linha_id: 'btg_pf-2026-05-06-001' })]);
  const sheet = {
    lancamentos: [],
    recorrentes_ativos: [],
    recebiveis_esperados: [{ id: 'reb-001', descricao: 'Hotmart julho', valor: 2300, data_prevista: '2026-05-05' }],
  };
  const r = reconcile(csv, sheet, cache, null, new Set());
  assert.equal(r.summary.candidato_recebivel, 1);
  assert.equal(r.candidato_recebivel[0].recebivel_id, 'reb-001');
});

test('skipped_reimport: linha_id in markers', () => {
  const csv = canonical([linha({})]);
  const sheet = { lancamentos: [], recorrentes_ativos: [], recebiveis_esperados: [] };
  const r = reconcile(csv, sheet, cache, null, new Set(['btg_pf-2026-05-05-001']));
  assert.equal(r.summary.skipped_reimport, 1);
  assert.equal(r.summary.to_add, 0);
});

test('to_add: unmatched lines get classify suggestion', () => {
  const csv = canonical([linha({ descricao_raw: 'UBER *TRIP 1111', data: '2026-05-07', linha_id: 'btg_pf-2026-05-07-001', valor: 22 })]);
  const sheet = { lancamentos: [], recorrentes_ativos: [], recebiveis_esperados: [] };
  const r = reconcile(csv, sheet, cache, null, new Set());
  assert.equal(r.summary.to_add, 1);
  assert.equal(r.to_add[0].sugestao.categoria, 'Pessoal');
  assert.equal(r.to_add[0].sugestao.subcategoria, 'Transporte');
});

test('to_add: unmatched with no classify hit gets null sugestao fields', () => {
  const csv = canonical([linha({ descricao_raw: 'COMPRA ESTRANHA XYZ', linha_id: 'btg_pf-2026-05-07-002', data: '2026-05-07', valor: 99 })]);
  const sheet = { lancamentos: [], recorrentes_ativos: [], recebiveis_esperados: [] };
  const r = reconcile(csv, sheet, cache, null, new Set());
  assert.equal(r.summary.to_add, 1);
  assert.equal(r.to_add[0].sugestao.categoria, null);
  assert.equal(r.to_add[0].sugestao.confidence, 0);
});

test('to_add: hotmart categoria_hint takes priority via hotmartMap', () => {
  const csv = canonical([linha({
    descricao_raw: 'Tarifa de antecipação', categoria_hint: 'Antecipação', tipo: 'despesa',
    data: '2026-05-14', linha_id: 'hotmart-2026-05-14-001', valor: 24.12,
  })]);
  const sheet = { lancamentos: [], recorrentes_ativos: [], recebiveis_esperados: [] };
  const hotmartMap = { 'Antecipação': { categoria: 'Empresarial', subcategoria: 'Tarifas Bancárias' } };
  const r = reconcile(csv, sheet, cache, hotmartMap, new Set());
  assert.equal(r.summary.to_add, 1);
  assert.equal(r.to_add[0].sugestao.subcategoria, 'Tarifas Bancárias');
  assert.equal(r.to_add[0].sugestao.fonte, 'source');
});

test('ambiguous: multiple lançamento candidates', () => {
  const csv = canonical([linha({ valor: 45, descricao_raw: 'XPTO', linha_id: 'btg_pf-2026-05-07-001', data: '2026-05-07' })]);
  const sheet = {
    lancamentos: [
      { id: 'lan-aaa111', data: '2026-05-07', tipo: 'despesa', valor: 45, categoria: 'Pessoal', descricao: 'A', recorrente_id: '' },
      { id: 'lan-bbb222', data: '2026-05-08', tipo: 'despesa', valor: 45, categoria: 'Pessoal', descricao: 'B', recorrente_id: '' },
    ],
    recorrentes_ativos: [],
    recebiveis_esperados: [],
  };
  const r = reconcile(csv, sheet, cache, null, new Set());
  assert.equal(r.summary.ambiguous, 1);
  assert.equal(r.ambiguous[0].candidatos.length, 2);
  assert.equal(r.summary.matched, 0);
});

test('estorno_match: estorno finds the original despesa', () => {
  const csv = canonical([linha({
    tipo: 'estorno', valor: 80, descricao_raw: 'ESTORNO UBER',
    data: '2026-05-10', linha_id: 'btg_pf-2026-05-10-001',
  })]);
  const sheet = {
    lancamentos: [{ id: 'lan-orig999', data: '2026-05-05', tipo: 'despesa', valor: 80, categoria: 'Pessoal', descricao: 'Uber', recorrente_id: '' }],
    recorrentes_ativos: [],
    recebiveis_esperados: [],
  };
  const r = reconcile(csv, sheet, cache, null, new Set());
  assert.equal(r.summary.estorno_match, 1);
  assert.equal(r.estorno_match[0].lan_id_to_delete, 'lan-orig999');
});

test('estorno without match becomes to_add receita with prefix', () => {
  const csv = canonical([linha({
    tipo: 'estorno', valor: 80, descricao_raw: 'ESTORNO MISTERIOSO',
    data: '2026-05-10', linha_id: 'btg_pf-2026-05-10-001',
  })]);
  const sheet = { lancamentos: [], recorrentes_ativos: [], recebiveis_esperados: [] };
  const r = reconcile(csv, sheet, cache, null, new Set());
  assert.equal(r.summary.estorno_match, 0);
  assert.equal(r.summary.to_add, 1);
  assert.equal(r.to_add[0].linha.tipo, 'receita');
  assert.ok(r.to_add[0].linha.descricao_raw.startsWith('ESTORNO:'));
});

test('transferencia_interna: silent count', () => {
  const csv = canonical([linha({
    tipo: 'transferencia_interna', valor: 500, descricao_raw: 'TED PROPRIA',
    data: '2026-05-11', linha_id: 'btg_pf-2026-05-11-001', meio_pagamento_hint: 'Transferência',
  })]);
  const sheet = { lancamentos: [], recorrentes_ativos: [], recebiveis_esperados: [] };
  const r = reconcile(csv, sheet, cache, null, new Set());
  assert.equal(r.summary.transferencia_interna, 1);
  assert.equal(r.summary.to_add, 0);
});

test('summary counts match bucket lengths', () => {
  const csv = canonical([
    linha({ linha_id: 'btg_pf-2026-05-05-001' }),
    linha({ linha_id: 'btg_pf-2026-05-06-001', data: '2026-05-06', descricao_raw: 'UBER *TRIP 1', valor: 22 }),
    linha({ linha_id: 'btg_pf-2026-05-07-001', data: '2026-05-07', tipo: 'transferencia_interna', descricao_raw: 'TED PROPRIA', valor: 500 }),
  ]);
  const sheet = { lancamentos: [], recorrentes_ativos: [], recebiveis_esperados: [] };
  const r = reconcile(csv, sheet, cache, null, new Set());
  assert.equal(r.summary.total_linhas, 3);
  assert.equal(r.summary.to_add, r.to_add.length);
  assert.equal(r.summary.transferencia_interna, r.transferencia_interna.length);
});
