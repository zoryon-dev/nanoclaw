import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDescricao } from '../lib/normalize.mjs';

test('lowercases', () => {
  assert.equal(normalizeDescricao('NETFLIX'), 'netflix');
});

test('strips trailing digit tokens (transaction suffixes)', () => {
  assert.equal(normalizeDescricao('UBER *TRIP 3829'), 'uber trip');
});

test('strips *XXXX patterns inline', () => {
  assert.equal(normalizeDescricao('PAG*9982 IFOOD'), 'pag ifood');
});

test('collapses whitespace and punctuation to single space', () => {
  assert.equal(normalizeDescricao('NETFLIX.COM   BR'), 'netflix com br');
});

test('preserves alphabetic tokens with embedded digits (e.g. C1)', () => {
  assert.equal(normalizeDescricao('PAGAMENTO CARTAO C1 *1234'), 'pagamento cartao c1');
});

test('handles empty / whitespace-only input', () => {
  assert.equal(normalizeDescricao(''), '');
  assert.equal(normalizeDescricao('   '), '');
});

test('latin-1 accent normalization', () => {
  assert.equal(normalizeDescricao('Farmácia São João'), 'farmacia sao joao');
});
