import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCoinHistory, mergeVampirePools, recordObservations, summarizeHistory } from '../dist/src/coinHistory.js';

function fakeChrome() {
  const store = {};
  return {
    storage: {
      local: {
        get: async key => ({ [key]: store[key] }),
        set: async items => { Object.assign(store, items); }
      }
    }
  };
}

const token = (mint, symbol, name, price, cap, provider = 'Verified fixture') => ({
  mint, chain: 'solana', name, symbol, stage: 'new', launchedAt: 0, observedAt: 0,
  priceUsd: price, marketCapUsd: cap, fdvUsd: cap, liquidityUsd: 20000, liquidityChangePct: 0, priceChange5mPct: 1, imageUrl: null,
  trades: [], holders: null, developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: '' },
  mintAuthority: null, freezeAuthority: null, transferRestriction: null, migrationProgressPct: null, provider
});

test('coin history tracks observed highs and detects same-name repeats', async () => {
  const previous = globalThis.chrome;
  globalThis.chrome = fakeChrome();
  try {
    const now = Date.now();
    const a = '11111111111111111111111111111111';
    const b = '22222222222222222222222222222222';
    await recordObservations([token(a, 'SANC', 'Sanctuary', 0.001, 100000)], now);
    await recordObservations([token(a, 'SANC', 'Sanctuary', 0.002, 150000)], now + 1_000);
    await recordObservations([token(b, 'SANC', 'Sanctuary', 0.0005, 50000)], now + 2_000);

    const history = await loadCoinHistory();
    const view = summarizeHistory(history, { mint: a, symbol: 'SANC', name: 'Sanctuary' }, { priceUsd: 0.003, at: null, source: 'test' });
    assert.equal(view.observedHigh.priceUsd, 0.002);
    assert.equal(view.observedHigh.marketCapUsd, 150000);
    assert.equal(view.similar.length, 1);
    assert.equal(view.similar[0].mint, b);
    assert.equal(view.ath.priceUsd, 0.003);
  } finally { globalThis.chrome = previous; }
});

test('coin history ignores simulated demo tokens', async () => {
  const previous = globalThis.chrome;
  globalThis.chrome = fakeChrome();
  try {
    await recordObservations([token('11111111111111111111111111111111', 'DEMO', 'Demo', 0.001, 1000, 'SIMULATED DEMO')], Date.now());
    assert.deepEqual(await loadCoinHistory(), []);
  } finally { globalThis.chrome = previous; }
});

test('feed copies join the history view without inventing a first-seen time', async () => {
  const previous = globalThis.chrome;
  globalThis.chrome = fakeChrome();
  try {
    const now = Date.now();
    const mine = '11111111111111111111111111111111';
    const seen = '22222222222222222222222222222222';
    const fed = '33333333333333333333333333333333';
    await recordObservations([token(mine, 'MCH', 'MoonChacha', 0.001, 1000)], now - 5_000);
    await recordObservations([token(seen, 'MCH', 'MoonChacha', 0.001, 1000)], now - 4_000);

    const view = summarizeHistory(await loadCoinHistory(), { mint: mine, symbol: 'MCH', name: 'MoonChacha' });
    assert.equal(view.feedChecked, false, 'nothing claimed before the feed is searched');
    assert.deepEqual(view.similar.map(item => [item.mint, item.source]), [[seen, 'observed']]);

    const merged = mergeVampirePools(view, {
      pools: [
        { mint: seen, symbol: 'MCH', name: 'MoonChacha' },
        { mint: fed, symbol: 'MCH', name: 'Moon Chacha Copy' },
        { mint: mine, symbol: 'MCH', name: 'MoonChacha' }
      ],
      feedChecked: true,
      excludeMint: mine
    }, now);
    assert.equal(merged.feedChecked, true);
    assert.deepEqual(merged.similar.map(item => item.mint), [seen, fed], 'the observed coin keeps its earlier first-seen time');
    assert.deepEqual(merged.similar.map(item => item.source), ['observed', 'feed']);
    assert.equal(merged.similar[0]?.firstSeenAt, now - 4_000, 'an observed coin keeps the time Scout first saw it');
    assert.equal(merged.similar[1]?.firstSeenAt, now, 'a feed copy is stamped when it was found');
  } finally { globalThis.chrome = previous; }
});
