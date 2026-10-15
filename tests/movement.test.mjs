import test from 'node:test';
import assert from 'node:assert/strict';
import { activeTurnover, movementVerdict, runningTurnover, turnoverRatio } from '../dist/src/attention.js';

const now = Date.now();

function token(overrides = {}) {
  return {
    mint: '11111111111111111111111111111111', chain: 'solana', name: 'X', symbol: 'X', stage: 'new',
    launchedAt: now - 300_000, observedAt: now,
    priceUsd: 0.001, marketCapUsd: 60_000, fdvUsd: 60_000, liquidityUsd: 20_000, liquidityChangePct: null,
    priceChange5mPct: 0, imageUrl: null, trades: [], holders: null,
    developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: '' },
    mintAuthority: null, freezeAuthority: null, transferRestriction: null, migrationProgressPct: null,
    provider: 'test',
    ...overrides
  };
}

const reading = (volume5m, overrides = {}) => movementVerdict(token(overrides), { volume5m });

test('movement is read against the pool, so the same volume means different things', () => {
  // $40k is a pool turning over twice at $20k of liquidity, and nothing at all at $4m.
  assert.equal(reading(40_000).level, 'RUNNING');
  assert.equal(reading(40_000, { liquidityUsd: 4_000_000 }).level, 'QUIET');
  assert.equal(reading(6_000).level, 'ACTIVE');
  assert.equal(reading(800).level, 'QUIET');
});

test('the running bar is a pool turned over inside five minutes', () => {
  assert.equal(runningTurnover, 1);
  assert.equal(reading(20_000).level, 'RUNNING', 'exactly one turnover counts as running');
  assert.equal(reading(19_000).level, 'ACTIVE', 'just under is not');
  assert.ok(activeTurnover < runningTurnover, 'active sits below running so the tiers cannot overlap');
});

test('movement is measured without liquidity, rather than being declared unknown', () => {
  // A pool with no published liquidity still has a market cap to measure against.
  const thin = token({ liquidityUsd: null, marketCapUsd: 50_000 });
  assert.equal(movementVerdict(thin, { volume5m: 100_000 }).level, 'RUNNING');
  const unmeasurable = token({ liquidityUsd: null, marketCapUsd: null });
  assert.equal(movementVerdict(unmeasurable, { volume5m: 100_000 }).level, 'QUIET');
  assert.equal(turnoverRatio(unmeasurable, { volume5m: 100_000 }), null);
});

test('no trading is quiet, and never a division by zero', () => {
  assert.equal(reading(0).level, 'QUIET');
  assert.equal(reading(0).turnover, null);
  assert.equal(reading(0).detail, 'No 5m volume at all');
  // A zero or absent pool falls through to market cap before giving up entirely.
  assert.equal(turnoverRatio(token({ liquidityUsd: 0 }), { volume5m: 5000 }).toFixed(4), '0.0833');
  assert.equal(turnoverRatio(token({ liquidityUsd: 0, marketCapUsd: null }), { volume5m: 5000 }), null);
});

test('the readout states the multiple so it can be checked rather than trusted', () => {
  assert.match(reading(40_000).detail, /2\.0\u00d7 the pool/);
  assert.match(reading(400_000).detail, /20\u00d7 the pool/, 'extreme multiples stay readable');
});
