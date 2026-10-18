import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTokenTags, tokenTags } from '../dist/src/categories.js';

const token = overrides => ({
  mint: '11111111111111111111111111111111', chain: 'solana', name: 'Base', symbol: 'BASE',
  stage: 'new', launchedAt: null, observedAt: Date.now(), priceUsd: null, marketCapUsd: null, fdvUsd: null,
  liquidityUsd: null, liquidityChangePct: null, priceChange5mPct: null, imageUrl: null,
  trades: [], holders: null,
  developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: '' },
  mintAuthority: null, freezeAuthority: null, transferRestriction: null, migrationProgressPct: null, provider: 'test',
  ...overrides
});

test('launchpad tags map the pool platform to a distinct color', () => {
  const pump = tokenTags(token({ dexName: 'pumpfun' }));
  assert.equal(pump[0].id, 'pumpfun');
  assert.equal(pump[0].label, 'pump.fun');
  assert.equal(pump[0].kind, 'platform');
  assert.match(pump[0].color, /^#[0-9a-f]{6}$/i);
  assert.notEqual(pump[0].color, tokenTags(token({ dexName: 'raydium' }))[0].color);

  assert.equal(tokenTags(token({ dexName: 'raydium' }))[0].label, 'Raydium');
  assert.equal(tokenTags(token({ dexName: 'meteora' }))[0].label, 'Meteora');
  assert.equal(tokenTags(token({ dexName: 'usepaid' }))[0].id, 'usepaid');
  assert.equal(tokenTags(token({ dexName: 'stonk' }))[0].id, 'stonk');
});

test('an unknown platform is shown by name with a neutral color', () => {
  const tags = tokenTags(token({ dexName: 'some-new-dex' }));
  assert.equal(tags[0].label, 'Some New Dex');
  assert.equal(tags[0].color, '#7d97a6');
});

test('charity and narrative categories are detected from name/symbol', () => {
  assert.ok(tokenTags(token({ name: 'Save The Children Charity', symbol: 'CHARITY' })).some(t => t.id === 'charity'));
  assert.equal(formatTokenTags(tokenTags(token({ name: 'Elon Doge Rocket', symbol: 'DOGE' }))), 'Elon');
  assert.equal(formatTokenTags(tokenTags(token({}))), null);
});
