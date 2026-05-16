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
