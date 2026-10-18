import test from 'node:test';
import assert from 'node:assert/strict';
import { assessTokens } from '../dist/src/analysis.js';
import { warningFor } from '../dist/src/riskWarning.js';
import { defaults } from '../dist/src/settings.js';

const mint = '11111111111111111111111111111111';
const now = Date.now();

function base(overrides = {}) {
  return {
    mint, chain: 'solana', name: 'Test Coin', symbol: 'T', stage: 'new', launchedAt: now - 60_000, observedAt: now,
    priceUsd: 0.001, marketCapUsd: 50000, fdvUsd: 55000, liquidityUsd: 50000, liquidityChangePct: 0, priceChange5mPct: 5, imageUrl: null,
    trades: [], holders: [{ wallet: 'pool11111111111111111111111111111111', pct: 20, type: 'pool' }, { wallet: 'wallet111111111111111111111111111111', pct: 5, type: 'wallet' }],
    developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: '' },
    mintAuthority: false, freezeAuthority: false, transferRestriction: false, migrationProgressPct: null,
    provider: 'Verified fixture',
    ...overrides
  };
}

function assess(overrides = {}) {
  return assessTokens([base(overrides)], defaults, now)[0];
}

test('verified farmer evidence becomes a red FARMER DEV warning with real evidence links', () => {
  const a = assess({
    developer: {
      creator: 'creator11111111111111111111111111111', priorLaunches: 12, rapidFailures: 6, linkedSales: 0,
      source: 'verified', note: 'verified fixture',
      farmerEvidence: {
        linkedWallets: ['w11111111111111111111111111111111', 'w21111111111111111111111111111111', 'w31111111111111111111111111111111'],
        fundingTransactions: ['f11111111111111111111111111111111'],
        distributionTransactions: ['d11111111111111111111111111111111'],
        coordinatedSaleTransactions: ['s11111111111111111111111111111111', 's21111111111111111111111111111111']
      }
    }
  });
  assert.equal(a.farmer, true);
  const warning = warningFor(a, defaults);
  assert.ok(warning);
  assert.equal(warning.category, 'FARMER DEV');
  assert.equal(warning.severity, 'red');
  assert.ok(warning.reasons.some(reason => /FARMER DEV/i.test(reason)));
});

test('active token controls become a red critical security warning', () => {
  const warning = warningFor(assess({ freezeAuthority: true, transferRestriction: true }), defaults);
  assert.ok(warning);
  assert.equal(warning.category, 'CRITICAL TOKEN SECURITY RISK');
  assert.equal(warning.severity, 'red');
});

test('creator-linked sales and risky launch history become a RISKY DEV warning', () => {
  const dumping = warningFor(assess({
    developer: { creator: 'creator11111111111111111111111111111', priorLaunches: 2, rapidFailures: 0, linkedSales: 3, source: 'verified', note: '' }
  }), defaults);
  assert.ok(dumping);
  assert.equal(dumping.category, 'RISKY DEV');
  assert.equal(dumping.severity, 'orange');

  const launches = warningFor(assess({
    developer: { creator: 'creator11111111111111111111111111111', priorLaunches: 8, rapidFailures: 5, linkedSales: 0, source: 'verified', note: '' }
  }), defaults);
  assert.ok(launches);
  assert.equal(launches.category, 'RISKY DEV');
  assert.equal(launches.severity, 'orange');
});

test('weak liquidity and high impact become an orange liquidity warning', () => {
  const warning = warningFor(assess({ liquidityUsd: 1000 }), defaults);
  assert.ok(warning);
  assert.equal(warning.category, 'LIQUIDITY WARNING');
  assert.equal(warning.severity, 'orange');
});

test('extreme classified launch-wallet concentration gets a visible warning', () => {
  const warning = warningFor(assess({
    holderQuality: { devLaunches: 3, bundlerPct: 55, sniperPct: 8, botDegenPct: 10, freshWalletPct: 15 }
  }), defaults);
  assert.ok(warning);
  assert.equal(warning.category, 'CONCENTRATED LAUNCH WALLETS');
  assert.equal(warning.severity, 'orange');
  assert.match(warning.reasons[0], /bundled launch buys/);
});

test('a clean, well-evidenced token produces no warning', () => {
  const warning = warningFor(assess({
    developer: { creator: 'creator11111111111111111111111111111', priorLaunches: 2, rapidFailures: 0, linkedSales: 0, source: 'verified', note: '' }
  }), defaults);
  assert.equal(warning, null);
});
