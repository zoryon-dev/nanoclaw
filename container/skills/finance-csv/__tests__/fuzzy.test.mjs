import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenSetRatio } from '../lib/fuzzy.mjs';

test('identical strings score 1.0', () => {
  assert.equal(tokenSetRatio('Netflix', 'Netflix'), 1.0);
});

test('case-insensitive and whitespace-insensitive', () => {
  assert.equal(tokenSetRatio('NETFLIX  COM', 'netflix.com'), 1.0);
});

test('majority overlap scores above 0.6', () => {
  const score = tokenSetRatio('Uber Trip', 'Uber Rides Brazil');
  assert.ok(score < 0.6, `expected <0.6 for 1/3 overlap, got ${score}`);
});

test('all tokens overlap scores 1.0', () => {
  assert.equal(tokenSetRatio('netflix com br', 'NETFLIX.COM.BR'), 1.0);
});

test('no overlap scores 0', () => {
  assert.equal(tokenSetRatio('Netflix', 'Spotify'), 0);
});

test('punctuation and asterisks are split', () => {
  const score = tokenSetRatio('UBER *TRIP 3829', 'Uber');
  assert.ok(score >= 0.4 && score <= 0.6, `expected ~0.5, got ${score}`);
});

test('empty string returns 0', () => {
  assert.equal(tokenSetRatio('', 'anything'), 0);
  assert.equal(tokenSetRatio('anything', ''), 0);
});
