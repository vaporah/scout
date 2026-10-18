import test from 'node:test';
import assert from 'node:assert/strict';
import { holderReadings, shortWallet } from '../dist/src/holders.js';

const wallets = {
  pool: '1'.repeat(32),
  creator: '2'.repeat(32),
  second: '3'.repeat(32),
  third: '4'.repeat(32),
  fourth: '5'.repeat(32)
};

function token(overrides = {}) {
  return {
    mint: '11111111111111111111111111111111',
    chain: 'solana', name: 'Mikan', symbol: 'MIKAN', stage: 'new', launchedAt: null, observedAt: Date.now(),
    priceUsd: 0.001, marketCapUsd: 100000, fdvUsd: 100000, liquidityUsd: 20000,
    liquidityChangePct: null, priceChange5mPct: null, imageUrl: null,
    trades: [],
    holders: [
      { wallet: wallets.pool, pct: 30, type: 'wallet' },
      { wallet: wallets.second, pct: 8, type: 'wallet' },
      { wallet: wallets.creator, pct: 6, type: 'wallet' },
      { wallet: wallets.third, pct: 3, type: 'wallet' }
    ],
    holderCount: 1427,
    developer: { creator: wallets.creator, priorLaunches: 2, rapidFailures: 0, linkedSales: 0, source: 'verified', note: '' },
    mintAuthority: false, freezeAuthority: false, transferRestriction: false, migrationProgressPct: null,
    provider: 'test',
    ...overrides
  };
}

test('the breakdown is sorted, summed, and names the developer holding', () => {
  const reading = holderReadings(token());
  assert.ok(reading);
  assert.equal(reading.count, 1427);
  assert.equal(reading.listed, 4);
  assert.equal(reading.topPct, 47);
  assert.deepEqual(reading.top.map(h => h.pct), [30, 8, 6, 3], 'largest first');
  assert.equal(reading.largest.wallet, wallets.pool);
  assert.equal(reading.creator.pct, 6);
  assert.equal(reading.creator.rank, 3, 'the creator is the third largest holder');
  assert.equal(reading.creatorKnown, true);
});

test('a dominant wallet is called out, and a spread out one is not', () => {
  assert.match(holderReadings(token())?.note ?? '', /One wallet holds 30\.0% of the supply/);
  assert.equal(holderReadings(token({ holders: [{ wallet: wallets.second, pct: 9, type: 'wallet' }, { wallet: wallets.third, pct: 4, type: 'wallet' }] }))?.note, null);
});

test('a pool or curve vault is never reported as a single wallet holding the supply', () => {
  // A fresh launch is dominated by the bonding curve. "One wallet holds 99%" would be
  // a false alarm, so the share is reported without claiming a person holds it.
  const reading = holderReadings(token({
    holders: [{ wallet: wallets.pool, pct: 99.9, type: 'pool' }, { wallet: wallets.second, pct: 0.01, type: 'wallet' }]
  }));
  assert.equal(reading.largest.type, 'pool');
  assert.equal(reading.largest.pct, 99.9);
  assert.doesNotMatch(reading.note ?? '', /One wallet holds/);
  assert.match(reading.note ?? '', /usually the pool or bonding curve rather than a person/);
});

test('a creator outside the listed top holders is an upper bound, never zero held', () => {
  const reading = holderReadings(token({
    holders: [{ wallet: wallets.second, pct: 12, type: 'wallet' }, { wallet: wallets.third, pct: 5, type: 'wallet' }]
  }));
  assert.equal(reading.creatorKnown, true);
  assert.equal(reading.creator.pct, null, 'absent from the list is not the same as holding nothing');
  assert.equal(reading.creator.basis, 'below-list');
});

test('a developer share published by the feed is used as-is', () => {
  const reading = holderReadings(token({
    holders: [{ wallet: wallets.second, pct: 12, type: 'wallet' }],
    developerHoldingPct: 3.4
  }));
  assert.equal(reading.creator.pct, 3.4);
  assert.equal(reading.creator.basis, 'feed');
  assert.equal(reading.creator.rank, null, 'the feed gives a share, not a rank');
});

test('the wallet list wins over the feed share when the creator is ranked in it', () => {
  const reading = holderReadings(token({
    holders: [{ wallet: wallets.creator, pct: 9, type: 'wallet' }],
    developerHoldingPct: 3.4
  }));
  assert.equal(reading.creator.pct, 9, 'the direct evidence beats the summary figure');
  assert.equal(reading.creator.basis, 'ranked');
  assert.equal(reading.creator.rank, 1);
});

test('distribution bands alone still give real percentages', () => {
  const reading = holderReadings(token({
    holders: null,
    holderCount: 1427,
    holderBands: { top10: 38.3, next10: 12, mid: 12.1, rest: 37.6 },
    developerHoldingPct: null
  }));
  assert.ok(reading, 'bands are enough to report something');
  assert.equal(reading.count, 1427);
  assert.equal(reading.top.length, 0);
  assert.equal(reading.top10Pct, 38.3);
  assert.deepEqual(reading.bands.map(b => b.label), ['Top 10 wallets', 'Wallets 11-20', 'Wallets 21-40', 'Everyone else']);
  assert.equal(reading.largest, null);
});

test('an unknown creator wallet is reported as unknown rather than guessed', () => {
  const reading = holderReadings(token({ developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: '' } }));
  assert.equal(reading.creatorKnown, false);
  assert.equal(reading.creator, null);
  assert.equal(reading.listed, 4, 'the holder list is still shown');
});

test('with nothing published at all the reading is null, so the popup can say so', () => {
  const empty = { holders: null, holderCount: null, holderBands: null, developerHoldingPct: null };
  assert.equal(holderReadings(token(empty)), null);
  assert.equal(holderReadings(token({ ...empty, holders: [] })), null);
  // A count on its own is still worth reporting, even without the wallets behind it.
  const countOnly = holderReadings(token({ ...empty, holderCount: 1427 }));
  assert.equal(countOnly.count, 1427);
  assert.equal(countOnly.top.length, 0);
});

test('a locked creator balance is carried through', () => {
  const reading = holderReadings(token({
    holders: [{ wallet: wallets.creator, pct: 22, type: 'wallet', locked: true }]
  }));
  assert.equal(reading.creator.locked, true);
  assert.equal(reading.creator.rank, 1);
});

test('addresses are shortened for reading and left alone when already short', () => {
  assert.equal(shortWallet(wallets.creator), '222222\u202622222');
  assert.equal(shortWallet('abc'), 'abc');
});
