import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTokens } from '../dist/src/analysis.js';
import { defaults } from '../dist/src/settings.js';
import { trapCheck } from '../dist/src/trapCheck.js';

const now = Date.now();
const mint = '11111111111111111111111111111111';

function assessment(overrides = {}) {
  const token = {
    mint, chain: 'solana', name: 'Trap', symbol: 'TRAP', stage: 'new', launchedAt: now - 10_000, observedAt: now,
    priceUsd: .001, marketCapUsd: 50_000, fdvUsd: 50_000, liquidityUsd: 20_000, liquidityChangePct: null,
    priceChange5mPct: 1, imageUrl: null, trades: [], holderCount: 100,
    holders: [{ wallet: '22222222222222222222222222222222', pct: 12, type: 'wallet' }],
    developerHoldingPct: 0, holderQuality: { devLaunches: 1, bundlerPct: 2, sniperPct: 3, botDegenPct: 5, freshWalletPct: 10 },
    developer: { creator: mint, priorLaunches: 1, rapidFailures: 0, linkedSales: 0, source: 'verified', note: '' },
    mintAuthority: false, freezeAuthority: false, transferRestriction: false, migrationProgressPct: null,
    provider: 'Verified fixture', marketSnapshot: { volume5m: 1000, volume15m: 2000, buys5m: 8, sells5m: 2, buyers5m: 6, sellers5m: 2 },
    ...overrides
  };
  return assessTokens([token], defaults, now, new Set([mint]))[0];
}

test('trap check is green only when the relevant evidence is present and clean', () => {
  const result = trapCheck(assessment());
  assert.equal(result.verdict, 'GREEN');
  assert.match(result.clean.join(' '), /freeze authority revoked/);
  assert.equal(result.missing.length, 0);
});

test('trap check uses UNKNOWN instead of presenting missing evidence as green', () => {
  const result = trapCheck(assessment({ holders: null, holderCount: null, developerHoldingPct: undefined, holderQuality: null }));
  assert.equal(result.verdict, 'UNKNOWN');
  assert.match(result.missing.join(' '), /holder concentration/);
});

test('extreme sniper or insider-exit evidence produces a red verdict with reasons', () => {
  const sniped = trapCheck(assessment({ holderQuality: { devLaunches: 1, bundlerPct: 2, sniperPct: 68, botDegenPct: 5, freshWalletPct: 10 } }));
  assert.equal(sniped.verdict, 'RED');
  assert.match(sniped.redFlags.join(' '), /68.0%.*snipers/);

  const exit = trapCheck(assessment({ insiderFlow: {
    currentHoldingPct: 12, peakHoldingPct: 42, soldPct: 30, liquidityDropPct: 10,
    linkedWallets: [mint], status: 'exit', observedAt: now, source: 'fixture'
  } }));
  assert.equal(exit.verdict, 'RED');
  assert.match(exit.redFlags.join(' '), /insiders shed 30.0%/);
});
