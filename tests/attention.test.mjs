import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionSignals, hotCoin, volumeVerdict } from '../dist/src/attention.js';
import { defaults } from '../dist/src/settings.js';

const analytics = overrides => ({
  volume30s: null, volume1m: null, volume5m: 0, volume15m: 0, buys5m: 0, sells5m: 0,
  buyVolume5m: null, sellVolume5m: null, buyers5m: 0, sellers5m: 0, buyerGrowth: null,
  volumeAcceleration: null, repeatBuyers: 0, netPressure: null, suspiciousConcentration: false,
  ...overrides
});

const token = liquidityUsd => ({
  mint: '11111111111111111111111111111111', chain: 'solana', name: 'Base', symbol: 'BASE',
  stage: 'new', launchedAt: null, observedAt: Date.now(), priceUsd: null, marketCapUsd: null, fdvUsd: null,
  liquidityUsd, liquidityChangePct: null, priceChange5mPct: null, imageUrl: null,
  trades: [], holders: null, developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: '' },
  mintAuthority: null, freezeAuthority: null, transferRestriction: null, migrationProgressPct: null, provider: 'test'
});

test('high volume relative to liquidity and broad buying are attention signals', () => {
  const signals = attentionSignals(token(10000), analytics({ volume5m: 4000, buyers5m: 9, buys5m: 20 }));
  assert.deepEqual(signals.map(s => s.id), ['volume', 'broad']);
});

test('low turnover and few buyers produce no attention signal', () => {
  assert.deepEqual(attentionSignals(token(100000), analytics({ volume5m: 1000, buyers5m: 2, buys5m: 3 })), []);
});

test('broad buying is an attention signal even when liquidity is unknown', () => {
  const signals = attentionSignals(token(null), analytics({ volume5m: 5000, buyers5m: 9, buys5m: 20 }));
  assert.deepEqual(signals.map(s => s.id), ['broad']);
});

test('volume verdict rates 5m volume against liquidity', () => {
  assert.equal(volumeVerdict(token(10000), analytics({ volume5m: 5000 })).level, 'HIGH');
  assert.equal(volumeVerdict(token(10000), analytics({ volume5m: 1000 })).level, 'MODERATE');
  assert.equal(volumeVerdict(token(10000), analytics({ volume5m: 100 })).level, 'LOW');
  assert.equal(volumeVerdict(token(10000), analytics({ volume5m: 0 })).level, 'UNKNOWN');
});

/** A minimal assessment carrying only the fields the hot-coin rule reads. */
const assessment = overrides => ({
  token: token(20000),
  analytics: analytics({}),
  status: 'TOP CANDIDATE',
  score: 88,
  critical: [],
  warnings: [],
  missing: [],
  slippagePct: 1,
  confidence: 'medium',
  ...overrides
});

test('a hot coin needs the top verdict, a crowd of buyers, and heavy volume', () => {
  // $20k pool with 21 buyers, 32 buys and $8k traded in 5m: 40% of the pool.
  const busy = assessment({ analytics: analytics({ buyers5m: 21, buys5m: 32, sells5m: 10, volume5m: 8000 }) });
  const hot = hotCoin(busy, defaults);
  assert.ok(hot, 'a clean top candidate with broad buying and heavy volume is hot');
  assert.equal(hot.label, 'HOT');
  assert.match(hot.detail, /21 unique buyers, 32 buys/);
  assert.match(hot.detail, /40% of liquidity/, 'the reason names the turnover behind the highlight');
});

test('a strong coin with too few buyers, or a balanced book, never reads as hot', () => {
  const heavy = { volume5m: 8000 };
  // Few wallets, even with plenty of transactions: not a crowd.
  assert.equal(hotCoin(assessment({ analytics: analytics({ ...heavy, buyers5m: 4, buys5m: 60, sells5m: 5 }) }), defaults), null);
  // Plenty of buyers but not enough buy transactions.
  assert.equal(hotCoin(assessment({ analytics: analytics({ ...heavy, buyers5m: 30, buys5m: 12, sells5m: 2 }) }), defaults), null);
  // Two-sided churn: buys do not clearly outweigh sells.
  assert.equal(hotCoin(assessment({ analytics: analytics({ ...heavy, buyers5m: 25, buys5m: 24, sells5m: 22 }) }), defaults), null);
});

test('quiet volume never earns the brightest highlight, however clean the coin is', () => {
  const crowd = { buyers5m: 25, buys5m: 40, sells5m: 8 };
  // $8k into a $200k pool is only 4% turnover: too quiet to outshine anything.
  assert.equal(hotCoin(assessment({ token: token(200000), analytics: analytics({ ...crowd, volume5m: 8000 }) }), defaults), null);
  // Exactly at the quarter-of-the-pool line counts as heavy; just under does not.
  assert.equal(hotCoin(assessment({ token: token(20000), analytics: analytics({ ...crowd, volume5m: 5000 }) }), defaults)?.label, 'HOT');
  assert.equal(hotCoin(assessment({ token: token(20000), analytics: analytics({ ...crowd, volume5m: 4999 }) }), defaults), null);
  // No volume at all, and no baseline to measure it against, is never hot.
  assert.equal(hotCoin(assessment({ analytics: analytics({ ...crowd, volume5m: 0 }) }), defaults), null);
  assert.equal(hotCoin(assessment({ token: token(null), analytics: analytics({ ...crowd, volume5m: 8000 }) }), defaults), null,
    'with no liquidity and no market cap there is no way to call the volume heavy');
});

test('only a verdict the live feed can actually reach can be hot, and never a flagged one', () => {
  const crowd = analytics({ buyers5m: 21, buys5m: 32, sells5m: 10, volume5m: 8000 });
  // TOP CANDIDATE needs buyer-growth, net-pressure and volume-acceleration baselines
  // that the pool feed does not carry, so WATCH is where a strong new pair lands.
  assert.equal(hotCoin(assessment({ status: 'TOP CANDIDATE', analytics: crowd }), defaults)?.label, 'HOT');
  assert.equal(hotCoin(assessment({ status: 'WATCH', analytics: crowd }), defaults)?.label, 'HOT');
  // Scout is explicitly saying "not yet" for these.
  assert.equal(hotCoin(assessment({ status: 'WAIT FOR CONFIRMATION', analytics: crowd }), defaults), null);
  assert.equal(hotCoin(assessment({ status: 'UNKNOWN / INCOMPLETE', analytics: crowd }), defaults), null);
  // A critical finding makes signalClass red, so the row is never brightened.
  assert.equal(hotCoin(assessment({ critical: ['Freeze authority is still active'], analytics: crowd }), defaults), null);
  assert.equal(hotCoin(assessment({ status: 'HIGH RISK', analytics: crowd }), defaults), null);
  assert.equal(hotCoin(assessment({ token: { ...token(20000), priceChange5mPct: -40 }, analytics: crowd }), defaults), null);
  // Low liquidity makes signalClass amber as a caution, which is not the same amber as WATCH.
  assert.equal(hotCoin(assessment({ token: token(500), analytics: crowd }), defaults), null);
});
