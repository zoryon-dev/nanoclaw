import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../lib/classify.mjs';

const cache = {
  version: 1,
  patterns: [
    { match: 'uber trip', categoria: 'Pessoal', subcategoria: 'Transporte', hit_count: 23, last_seen: '2026-05-08' },
    { match: 'netflix com', categoria: 'Pessoal', subcategoria: 'Streaming', hit_count: 7, last_seen: '2026-05-03' },
    { match: 'tarifa', categoria: 'Empresarial', subcategoria: 'Tarifas Bancárias', hit_count: 0, last_seen: '2026-01-01' },
  ],
};

const hotmartMap = {
  'Antecipação': { categoria: 'Empresarial', subcategoria: 'Tarifas Bancárias' },
  'Comissão': { categoria: 'Empresarial', subcategoria: 'Tarifas Bancárias' },
  'Reembolso cartão hotmart': { categoria: 'Empresarial', subcategoria: 'Tarifas Bancárias' },
};

test('source hint (Hotmart Categoria) wins when in hotmartMap', () => {
  const r = classify({ descricao_raw: 'Tarifa de antecipação', categoria_hint: 'Antecipação' }, cache, hotmartMap);
  assert.equal(r.categoria, 'Empresarial');
  assert.equal(r.subcategoria, 'Tarifas Bancárias');
  assert.equal(r.fonte, 'source');
  assert.equal(r.confidence, 0.9);
});

test('source hint falls through when not in hotmartMap (e.g. "Venda")', () => {
  // "Venda" isn't in hotmartMap → fall through to cache lookup
  const r = classify({ descricao_raw: 'Lançamento de crédito | PRODUTO_27', categoria_hint: 'Venda' }, cache, hotmartMap);
  // No cache match either → null
  assert.equal(r, null);
});

test('cache exact match wins when no source hint applies', () => {
  const r = classify({ descricao_raw: 'UBER TRIP', categoria_hint: null }, cache, hotmartMap);
  assert.equal(r.categoria, 'Pessoal');
  assert.equal(r.subcategoria, 'Transporte');
  assert.equal(r.fonte, 'cache');
  assert.ok(r.confidence >= 0.9);
});

test('cache substring match (medium confidence)', () => {
  // "PAG NETFLIX COM BR" normalizes to "pag netflix com br" which CONTAINS "netflix com"
  const r = classify({ descricao_raw: 'PAG NETFLIX COM BR', categoria_hint: null }, cache, hotmartMap);
  assert.equal(r.categoria, 'Pessoal');
  assert.equal(r.subcategoria, 'Streaming');
  assert.equal(r.fonte, 'cache');
  assert.ok(r.confidence >= 0.7 && r.confidence < 0.9);
});

test('seed pattern works case-insensitively for fees', () => {
  const r = classify({ descricao_raw: 'TARIFA TED ENVIADA', categoria_hint: null }, cache, hotmartMap);
  assert.equal(r.subcategoria, 'Tarifas Bancárias');
});

test('no match returns null', () => {
  assert.equal(classify({ descricao_raw: 'COMPRA DESCONHECIDA XYZ', categoria_hint: null }, cache, hotmartMap), null);
});

test('null hotmartMap is safe (only cache is consulted)', () => {
  const r = classify({ descricao_raw: 'UBER TRIP', categoria_hint: 'Antecipação' }, cache, null);
  assert.equal(r.fonte, 'cache');
});

test('empty cache + null hotmartMap returns null even with source hint', () => {
  const r = classify({ descricao_raw: 'X', categoria_hint: 'Antecipação' }, { version: 1, patterns: [] }, null);
  assert.equal(r, null);
});

test('longer pattern beats shorter on substring match', () => {
  const richCache = {
    version: 1,
    patterns: [
      { match: 'mercado',  categoria: 'Pessoal',  subcategoria: 'Outros' },
      { match: 'mercado livre', categoria: 'Pessoal', subcategoria: 'Compras Online' },
    ],
  };
  const r = classify({ descricao_raw: 'pag mercado livre com', categoria_hint: null }, richCache, null);
  assert.equal(r.subcategoria, 'Compras Online');
});
