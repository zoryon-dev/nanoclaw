import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseBtgPf } from '../lib/parsers/btg_pf.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

test('btg_pf: parses fixture into canonical schema', () => {
  const buf = readFileSync(join(FIXTURES, 'btg-pf-sample.xls'));
  const result = parseBtgPf(buf);

  assert.equal(result.banco, 'btg_pf');
  assert.equal(result.escopo, 'PF');
  assert.equal(result.conta_inferida, 'BTG D');
  assert.match(result.periodo.inicio, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(result.periodo.fim, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Array.isArray(result.linhas));
  assert.ok(result.linhas.length > 0, 'expected at least one row');
});

test('btg_pf: every linha has required fields with correct types', () => {
  const buf = readFileSync(join(FIXTURES, 'btg-pf-sample.xls'));
  const { linhas } = parseBtgPf(buf);

  for (const linha of linhas) {
    assert.match(linha.linha_id, /^btg_pf-\d{4}-\d{2}-\d{2}-\d{3}$/);
    assert.match(linha.data, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof linha.valor, 'number');
    assert.ok(linha.valor >= 0, `valor must be non-negative, got ${linha.valor}`);
    assert.ok(
      ['despesa', 'receita', 'estorno', 'transferencia_interna'].includes(linha.tipo),
      `unexpected tipo: ${linha.tipo}`,
    );
    assert.equal(typeof linha.descricao_raw, 'string');
    assert.equal(linha.banco_tx_id, null);
    // categoria_hint is set when BTG provides one (most rows)
    if (linha.categoria_hint !== null) {
      assert.equal(typeof linha.categoria_hint, 'string');
    }
  }
});

test('btg_pf: skips repeated header blocks (no rows from Cliente/Saldo Diário)', () => {
  const buf = readFileSync(join(FIXTURES, 'btg-pf-sample.xls'));
  const { linhas } = parseBtgPf(buf);
  // None of the parsed linhas should have descricao "Cliente:", "Saldo Diário", "Categoria", etc.
  const forbidden = ['Cliente:', 'CPF:', 'Conta:', 'Categoria', 'Descrição', 'Saldo Diário'];
  for (const linha of linhas) {
    for (const f of forbidden) {
      assert.notEqual(linha.descricao_raw, f, `should have skipped header value: ${f}`);
    }
  }
});

test('btg_pf: deterministic linha_id across reparses', () => {
  const buf = readFileSync(join(FIXTURES, 'btg-pf-sample.xls'));
  const a = parseBtgPf(buf);
  const b = parseBtgPf(buf);
  assert.deepEqual(a.linhas.map((l) => l.linha_id), b.linhas.map((l) => l.linha_id));
});

test('btg_pf: tipo derivation from valor sign and operation type', () => {
  const buf = readFileSync(join(FIXTURES, 'btg-pf-sample.xls'));
  const { linhas } = parseBtgPf(buf);
  // Spot check: at least one despesa and one receita exist in the fixture
  assert.ok(linhas.some((l) => l.tipo === 'despesa'), 'expected at least one despesa');
  // (receita is rare in PF — may or may not exist; don't assert)
});

test('btg_pf: meio_pagamento_hint derived from Transação column', () => {
  const buf = readFileSync(join(FIXTURES, 'btg-pf-sample.xls'));
  const { linhas } = parseBtgPf(buf);
  const pixRows = linhas.filter((l) => l.meio_pagamento_hint === 'PIX');
  // At least one PIX row in the fixture (likely)
  assert.ok(pixRows.length > 0, 'expected at least one PIX line in BTG PF fixture');
});

test('btg_pf: categoria_hint captures BTG own Categoria column', () => {
  const buf = readFileSync(join(FIXTURES, 'btg-pf-sample.xls'));
  const { linhas } = parseBtgPf(buf);
  // At least one row should have a categoria_hint (most BTG rows do)
  const withHint = linhas.filter((l) => l.categoria_hint !== null);
  assert.ok(withHint.length > 0, 'expected at least one row with categoria_hint from BTG Categoria column');
});

test('btg_pf: throws on empty/invalid buffer', () => {
  assert.throws(() => parseBtgPf(Buffer.from('')), /empty|invalid/i);
});

import { parseBtgPj } from '../lib/parsers/btg_pj.mjs';

test('btg_pj: parses fixture into canonical schema', () => {
  const raw = readFileSync(join(FIXTURES, 'btg-pj-sample.csv'), 'utf-8');
  const result = parseBtgPj(raw);

  assert.equal(result.banco, 'btg_pj');
  assert.equal(result.escopo, 'PJ');
  assert.equal(result.conta_inferida, 'BTG PJ');
  assert.match(result.periodo.inicio, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(result.periodo.fim, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(result.linhas.length > 0);
});

test('btg_pj: every linha has required fields with correct types', () => {
  const raw = readFileSync(join(FIXTURES, 'btg-pj-sample.csv'), 'utf-8');
  const { linhas } = parseBtgPj(raw);

  for (const linha of linhas) {
    assert.match(linha.linha_id, /^btg_pj-\d{4}-\d{2}-\d{2}-\d{3}$/);
    assert.match(linha.data, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof linha.valor, 'number');
    assert.ok(linha.valor >= 0, `valor must be non-negative, got ${linha.valor}`);
    assert.ok(
      ['despesa', 'receita', 'estorno', 'transferencia_interna'].includes(linha.tipo),
    );
    assert.equal(typeof linha.descricao_raw, 'string');
    assert.equal(linha.banco_tx_id, null);
    assert.equal(linha.categoria_hint, null);
  }
});

test('btg_pj: BR number format parsed correctly', () => {
  const raw = readFileSync(join(FIXTURES, 'btg-pj-sample.csv'), 'utf-8');
  const { linhas } = parseBtgPj(raw);
  // First data row: "-1.700,00" → 1700.00 (abs) → 1700 as number
  assert.equal(linhas[0].valor, 1700);
  assert.equal(linhas[0].tipo, 'despesa');
});

test('btg_pj: receita detected from positive Valor', () => {
  const raw = readFileSync(join(FIXTURES, 'btg-pj-sample.csv'), 'utf-8');
  const { linhas } = parseBtgPj(raw);
  assert.ok(linhas.some((l) => l.tipo === 'receita'), 'expected at least one receita');
});

test('btg_pj: deterministic linha_id', () => {
  const raw = readFileSync(join(FIXTURES, 'btg-pj-sample.csv'), 'utf-8');
  const a = parseBtgPj(raw);
  const b = parseBtgPj(raw);
  assert.deepEqual(a.linhas.map((l) => l.linha_id), b.linhas.map((l) => l.linha_id));
});

test('btg_pj: meio_pagamento_hint derived from descricao', () => {
  const raw = readFileSync(join(FIXTURES, 'btg-pj-sample.csv'), 'utf-8');
  const { linhas } = parseBtgPj(raw);
  assert.ok(linhas.some((l) => l.meio_pagamento_hint === 'PIX'));
  assert.ok(linhas.some((l) => l.meio_pagamento_hint === 'Boleto'));
  assert.ok(linhas.some((l) => l.meio_pagamento_hint === 'Saque'));
});

test('btg_pj: throws on empty CSV', () => {
  assert.throws(() => parseBtgPj(''), /empty|header/i);
});

test('btg_pj: throws on header-only CSV', () => {
  assert.throws(() => parseBtgPj('"Data","Descricao","Valor","Saldo"\n'), /no data|empty/i);
});

import { parseInter } from '../lib/parsers/inter.mjs';

test('inter: skips preamble and parses fixture', () => {
  const raw = readFileSync(join(FIXTURES, 'inter-pf-sample.csv'), 'utf-8');
  const result = parseInter(raw);

  assert.equal(result.banco, 'inter');
  assert.equal(result.escopo, 'PF');
  assert.equal(result.conta_inferida, 'Inter PF');
  assert.match(result.periodo.inicio, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(result.periodo.fim, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(result.linhas.length > 0);
  // Should have skipped the 5 preamble rows + header + blank
  // and emitted only actual transaction rows
  assert.ok(result.linhas.length < 50, 'expected fewer rows than total file rows');
});

test('inter: every linha has required fields', () => {
  const raw = readFileSync(join(FIXTURES, 'inter-pf-sample.csv'), 'utf-8');
  const { linhas } = parseInter(raw);
  for (const linha of linhas) {
    assert.match(linha.linha_id, /^inter-\d{4}-\d{2}-\d{2}-\d{3}$/);
    assert.match(linha.data, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof linha.valor, 'number');
    assert.ok(linha.valor >= 0);
    assert.ok(['despesa', 'receita', 'estorno', 'transferencia_interna'].includes(linha.tipo));
    assert.equal(typeof linha.descricao_raw, 'string');
    assert.equal(linha.banco_tx_id, null);
    assert.equal(linha.categoria_hint, null);
  }
});

test('inter: descricao_raw combines Histórico and Descrição', () => {
  const raw = readFileSync(join(FIXTURES, 'inter-pf-sample.csv'), 'utf-8');
  const { linhas } = parseInter(raw);
  // At least one row should have the " | " separator showing both fields combined
  assert.ok(linhas.some((l) => l.descricao_raw.includes(' | ')), 'expected at least one combined descricao');
});

test('inter: sign on Valor maps to despesa/receita', () => {
  const raw = readFileSync(join(FIXTURES, 'inter-pf-sample.csv'), 'utf-8');
  const { linhas } = parseInter(raw);
  // First data row in fixture: "-0,73" → despesa
  // Find rows by date+value pattern
  assert.ok(linhas.some((l) => l.tipo === 'despesa'));
});

test('inter: PIX meio_pagamento_hint detected', () => {
  const raw = readFileSync(join(FIXTURES, 'inter-pf-sample.csv'), 'utf-8');
  const { linhas } = parseInter(raw);
  assert.ok(linhas.some((l) => l.meio_pagamento_hint === 'PIX'));
});

test('inter: deterministic linha_id', () => {
  const raw = readFileSync(join(FIXTURES, 'inter-pf-sample.csv'), 'utf-8');
  const a = parseInter(raw);
  const b = parseInter(raw);
  assert.deepEqual(a.linhas.map((l) => l.linha_id), b.linhas.map((l) => l.linha_id));
});

test('inter: throws on empty CSV', () => {
  assert.throws(() => parseInter(''), /empty/i);
});

test('inter: throws when header row not found', () => {
  // CSV with preamble but no real header
  assert.throws(
    () => parseInter('Extrato\nConta;123\nPeríodo;...\n'),
    /header not found|invalid/i,
  );
});

import { parseHotmart } from '../lib/parsers/hotmart.mjs';

test('hotmart: parses fixture with BOM and PT-BR headers', () => {
  const raw = readFileSync(join(FIXTURES, 'hotmart-sample.csv'), 'utf-8');
  const result = parseHotmart(raw);

  assert.equal(result.banco, 'hotmart');
  assert.equal(result.escopo, 'PJ');
  assert.equal(result.conta_inferida, 'Hotmart');
  assert.match(result.periodo.inicio, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(result.periodo.fim, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(result.linhas.length > 0);
});

test('hotmart: every linha has required fields', () => {
  const raw = readFileSync(join(FIXTURES, 'hotmart-sample.csv'), 'utf-8');
  const { linhas } = parseHotmart(raw);
  for (const linha of linhas) {
    assert.match(linha.linha_id, /^hotmart-\d{4}-\d{2}-\d{2}-\d{3}$/);
    assert.match(linha.data, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(typeof linha.valor, 'number');
    assert.ok(linha.valor >= 0);
    assert.ok(['despesa', 'receita', 'estorno'].includes(linha.tipo));
    assert.equal(typeof linha.descricao_raw, 'string');
    assert.equal(linha.meio_pagamento_hint, null);
    // categoria_hint always set for Hotmart
    assert.equal(typeof linha.categoria_hint, 'string');
    assert.ok(linha.categoria_hint.length > 0);
  }
});

test('hotmart: banco_tx_id falls back through Transação and Identificador', () => {
  const raw = readFileSync(join(FIXTURES, 'hotmart-sample.csv'), 'utf-8');
  const { linhas } = parseHotmart(raw);
  // Most rows should have a tx_id (HP-prefix or hash); few may have null
  const withHpTxId = linhas.filter((l) => /^HP/.test(l.banco_tx_id ?? ''));
  assert.ok(withHpTxId.length > 0, 'expected at least some HP-prefix Transação ids');
  const withHashTxId = linhas.filter((l) => /^[0-9a-f]{20,}$/.test(l.banco_tx_id ?? ''));
  assert.ok(withHashTxId.length > 0, 'expected at least some hash-style Identificador ids');
});

test('hotmart: categoria_hint set from Categoria column', () => {
  const raw = readFileSync(join(FIXTURES, 'hotmart-sample.csv'), 'utf-8');
  const { linhas } = parseHotmart(raw);
  const categorias = new Set(linhas.map((l) => l.categoria_hint));
  // Known values from fixture
  assert.ok(categorias.has('Antecipação'));
  assert.ok(categorias.has('Venda') || categorias.has('Compra com cartão ou saldo'));
});

test('hotmart: tipo derivation handles reembolso as estorno', () => {
  const raw = readFileSync(join(FIXTURES, 'hotmart-sample.csv'), 'utf-8');
  const { linhas } = parseHotmart(raw);
  // If any "Reembolso cartão hotmart" rows exist in fixture, they should be estorno
  const reembolsos = linhas.filter((l) => l.categoria_hint === 'Reembolso cartão hotmart');
  if (reembolsos.length > 0) {
    for (const r of reembolsos) assert.equal(r.tipo, 'estorno');
  }
});

test('hotmart: descricao_raw combines Descrição and Nome do produto', () => {
  const raw = readFileSync(join(FIXTURES, 'hotmart-sample.csv'), 'utf-8');
  const { linhas } = parseHotmart(raw);
  // Rows with PRODUTO_* in Nome do produto should have " | " in descricao_raw
  const withProduto = linhas.filter((l) => l.descricao_raw.includes('PRODUTO_'));
  assert.ok(withProduto.length > 0, 'expected some rows with product name embedded');
  for (const l of withProduto) {
    assert.ok(l.descricao_raw.includes(' | '), 'product rows should use " | " separator');
  }
});

test('hotmart: deterministic linha_id', () => {
  const raw = readFileSync(join(FIXTURES, 'hotmart-sample.csv'), 'utf-8');
  const a = parseHotmart(raw);
  const b = parseHotmart(raw);
  assert.deepEqual(a.linhas.map((l) => l.linha_id), b.linhas.map((l) => l.linha_id));
});

test('hotmart: throws on empty CSV', () => {
  assert.throws(() => parseHotmart(''), /empty/i);
});
