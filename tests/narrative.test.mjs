import test from 'node:test';
import assert from 'node:assert/strict';
import { narrativeTags } from '../dist/src/narrative.js';

const token = overrides => ({
  mint: '11111111111111111111111111111111', chain: 'solana', name: 'Base', symbol: 'BASE',
  stage: 'new', launchedAt: null, observedAt: Date.now(), priceUsd: null, marketCapUsd: null, fdvUsd: null,
  liquidityUsd: null, liquidityChangePct: null, priceChange5mPct: null, imageUrl: null,
  trades: [], holders: null, developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: '' },
  mintAuthority: null, freezeAuthority: null, transferRestriction: null, migrationProgressPct: null, provider: 'test',
  ...overrides
});

test('narrative detection matches Elon/Musk, Trump and AI keywords in name or symbol', () => {
  assert.deepEqual(narrativeTags(token({ name: 'Elon Musk Rocket', symbol: 'ELON' })).map(t => t.tag), ['ELON']);
  assert.deepEqual(narrativeTags(token({ name: 'Doge Inu', symbol: 'DOGE' })).map(t => t.tag), ['ELON']);
  assert.deepEqual(narrativeTags(token({ name: 'MAGA Coin', symbol: 'MAGA' })).map(t => t.tag), ['TRUMP']);
  assert.deepEqual(narrativeTags(token({ name: 'Agent Framework', symbol: 'AGENT' })).map(t => t.tag), ['AI']);
});

test('narrative detection ignores unrelated names', () => {
  assert.deepEqual(narrativeTags(token({ name: 'Fish IsHoulder Hold', symbol: 'FISH' })), []);
});
