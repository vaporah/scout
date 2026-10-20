import test from 'node:test';
import assert from 'node:assert/strict';
import { resetInsiderFlow, trackInsiderFlow } from '../dist/src/insiderFlow.js';
import { assessTokens } from '../dist/src/analysis.js';
import { warningFor } from '../dist/src/riskWarning.js';
import { defaults } from '../dist/src/settings.js';

const mint = '11111111111111111111111111111111';
const insiderWallet = '22222222222222222222222222222222';

function token(now, insiderPct, liquidityUsd = 50_000) {
  return {
    mint, chain: 'solana', name: 'Exit Test', symbol: 'EXIT', stage: 'new', launchedAt: now - 30_000, observedAt: now,
    priceUsd: 0.001, marketCapUsd: 100_000, fdvUsd: 100_000, liquidityUsd, liquidityChangePct: null,
    priceChange5mPct: 0, imageUrl: null, trades: [],
    holders: [{ wallet: insiderWallet, pct: insiderPct, type: 'wallet', insider: true }],
    developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: '' },
    mintAuthority: false, freezeAuthority: false, transferRestriction: false, migrationProgressPct: null,
    provider: 'Verified fixture', marketSnapshot: { volume5m: 1000, volume15m: 1000, buys5m: 5, sells5m: 1, buyers5m: null, sellers5m: null }
  };
}

test('tracks labelled insider supply exits from the recent peak', () => {
  resetInsiderFlow();
  const now = Date.now();
  const [baseline] = trackInsiderFlow([token(now, 42)], now);
  assert.equal(baseline.insiderFlow.status, 'watching');
  assert.equal(baseline.insiderFlow.currentHoldingPct, 42);

  const [selling] = trackInsiderFlow([token(now + 15_000, 37)], now + 15_000);
  assert.equal(selling.insiderFlow.status, 'selling');
  assert.equal(selling.insiderFlow.soldPct, 5);

  const [exit] = trackInsiderFlow([token(now + 30_000, 20)], now + 30_000);
  assert.equal(exit.insiderFlow.status, 'exit');
  assert.equal(exit.insiderFlow.soldPct, 22);
  const assessment = assessTokens([exit], defaults, now + 30_000, new Set([mint]))[0];
  assert.equal(assessment.status, 'DISQUALIFIED');
  assert.match(assessment.critical.join(' '), /INSIDER EXIT/);
  assert.equal(warningFor(assessment, defaults).category, 'INSIDER EXIT');
});

test('a rapid observed liquidity withdrawal triggers the exit warning independently', () => {
  resetInsiderFlow();
  const now = Date.now();
  trackInsiderFlow([token(now, 8, 100_000)], now);
  const [exit] = trackInsiderFlow([token(now + 15_000, 8, 55_000)], now + 15_000);
  assert.equal(exit.insiderFlow.status, 'exit');
  assert.equal(exit.insiderFlow.liquidityDropPct, 45);
  const assessment = assessTokens([exit], defaults, now + 15_000, new Set([mint]))[0];
  assert.match(assessment.critical.join(' '), /LIQUIDITY PULL/);
});

test('unlabelled holders never become insider evidence', () => {
  resetInsiderFlow();
  const now = Date.now();
  const plain = { ...token(now, 40), holders: [{ wallet: insiderWallet, pct: 40, type: 'wallet' }] };
  const [tracked] = trackInsiderFlow([plain], now);
  assert.equal(tracked.insiderFlow.currentHoldingPct, null);
  assert.equal(tracked.insiderFlow.status, 'unknown');
});
