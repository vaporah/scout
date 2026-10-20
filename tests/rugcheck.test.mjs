import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHolderReport, parseReportMeta, vaultLikePct } from '../dist/src/rugcheck.js';

const mint = '5mT3nZKD1BSe2yYCvLqaB2ZmPWvaD8tADwuLrdJLLWtE';
const curve = '94S42P5MTk6LZFfgdeEDiLNCWMY57P8SmQb4yACBfzoo';
const wallet = 'FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM';
const account = '4apQ71aBeJ7ajizumPSHJ5bhPmjcaQFpKtZEiHcddu4q';
/** Base58 only: the address pattern rejects 0, O, I and l. */
const base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
let seq = 0;
/** A distinct, well-formed Solana address for each call. */
const address = () => {
  let n = ++seq;
  let out = '';
  while (n > 0) { out = base58[n % 58] + out; n = Math.floor(n / 58); }
  return out.padStart(32, '9');
};

function report(overrides = {}) {
  return {
    mint,
    totalHolders: 21,
    topHolders: [
      { address: account, owner: wallet, pct: 8.8, insider: false },
      { address: curve, owner: curve, pct: 0.0012, insider: false }
    ],
    ...overrides
  };
}

test('a holder report is read as accounts, largest first', () => {
  const reading = parseHolderReport(report(), mint);
  assert.ok(reading);
  assert.equal(reading.count, 21);
  assert.deepEqual(reading.accounts.map(a => a.pct), [8.8, 0.0012]);
  assert.equal(reading.accounts[0].wallet, wallet, 'the owning wallet is used, not the token account');
});

test('a report for a different mint is refused outright', () => {
  // This is the one failure that would put another coin's concentration on this one.
  assert.equal(parseHolderReport(report({ mint: 'SomethingElse' }), mint), null);
  assert.equal(parseHolderReport(report({ mint: undefined }), mint), null);
  assert.equal(parseHolderReport(report(), '11111111111111111111111111111111'), null);
});

test('a huge account is treated as a vault, not as a wallet holding the supply', () => {
  const curveHeld = parseHolderReport(report({
    topHolders: [{ address: curve, owner: curve, pct: 99.9975, insider: false }, { address: account, owner: wallet, pct: 0.001, insider: false }]
  }), mint);
  assert.equal(curveHeld.accounts[0].type, 'pool', 'the bonding curve must never be reported as a whale wallet');
  assert.equal(curveHeld.accounts[0].pct, 99.9975, 'the share is still reported in full, only the wording changes');
  assert.ok(vaultLikePct >= 50 && vaultLikePct < 99, 'the threshold sits below the curve share so the case is covered');
});

test('an insider flag outweighs the size heuristic', () => {
  // A person can legitimately hold most of a supply, and that is a finding, not a vault.
  const insider = parseHolderReport(report({
    topHolders: [{ address: curve, owner: curve, pct: 80, insider: true }]
  }), mint);
  assert.equal(insider.accounts[0].type, 'wallet');
  assert.equal(insider.accounts[0].insider, true, 'the provider label is retained for exit tracking');
});

test('junk entries are dropped instead of becoming zero-percent holders', () => {
  const listed = address();
  const ownerless = address();
  const repeated = address();
  const reading = parseHolderReport(report({
    topHolders: [
      { address: listed, owner: address(), pct: '' },
      { address: listed, owner: address(), pct: 0 },
      { address: listed, owner: address(), pct: 'not a number' },
      { owner: ownerless, pct: 5 },
      { address: address(), owner: repeated, pct: 4 },
      { address: address(), owner: repeated, pct: 4 }
    ]
  }), mint);
  assert.deepEqual(reading.accounts.map(a => a.pct), [5, 4], 'blank, zero and unparseable entries are ignored');
  assert.equal(reading.accounts.length, 2, 'the same wallet is not listed twice');
  assert.equal(reading.accounts[0].wallet, ownerless, 'an entry with no address still names the owning wallet');
});

test('a report with no accounts but a count still answers the count', () => {
  const reading = parseHolderReport(report({ topHolders: [] }), mint);
  assert.equal(reading.count, 21);
  assert.deepEqual(reading.accounts, []);
  assert.equal(parseHolderReport(report({ topHolders: [], totalHolders: 0 }), mint), null, 'nothing at all is nothing at all');
});

test('the report also describes the coin itself, for coins no indexer lists', () => {
  const withMeta = { ...report(), tokenMeta: { name: 'Nvidia', symbol: 'NVIDIA' }, price: 0.000136, totalMarketLiquidity: 0.0565 };
  const meta = parseReportMeta(withMeta, mint);
  assert.deepEqual(meta, {
    name: 'Nvidia', symbol: 'NVIDIA', priceUsd: 0.000136, liquidityUsd: 0.0565,
    creator: null, creatorHoldingPct: null
  });
  // The same payload read as a holder report carries it through in one pass.
  assert.deepEqual(parseHolderReport(withMeta, mint).meta, meta);
});

test('the deploying wallet and what it still holds are read from the report', () => {
  // Balance and supply are both raw units, so the ratio needs no decimal adjustment.
  const meta = parseReportMeta({
    ...report(),
    creator: wallet,
    creatorBalance: 500,
    token: { supply: 1000, decimals: 6 }
  }, mint);
  assert.equal(meta.creator, wallet);
  assert.equal(meta.creatorHoldingPct, 50);
});

test('a creator that has sold out is reported as zero held, not as unknown', () => {
  // "The deployer holds nothing" is a finding; it must not be blanked into "not published".
  const meta = parseReportMeta({ ...report(), creator: wallet, creatorBalance: 0, token: { supply: 1000 } }, mint);
  assert.equal(meta.creatorHoldingPct, 0);
  // Without a supply there is no share to state, however much the wallet holds.
  const noSupply = parseReportMeta({ ...report(), creator: wallet, creatorBalance: 500, token: {} }, mint);
  assert.equal(noSupply.creator, wallet);
  assert.equal(noSupply.creatorHoldingPct, null);
  // A creator field that is not a real address is not a creator.
  assert.equal(parseReportMeta({ ...report(), creator: 'not-an-address' }, mint), null);
});

test('a zero price is unpriced, not worthless, and a foreign report is ignored', () => {
  // Reporting $0 would claim the coin is worthless rather than that no price is known.
  assert.deepEqual(parseReportMeta({ ...report(), price: 0, totalMarketLiquidity: 0, tokenMeta: { name: 'X', symbol: 'X' } }, mint),
    { name: 'X', symbol: 'X', priceUsd: null, liquidityUsd: null, creator: null, creatorHoldingPct: null });
  assert.equal(parseReportMeta({ ...report(), price: 5 }, 'SomeOtherMint'), null, 'another coin\u2019s figures are never borrowed');
  assert.equal(parseReportMeta({ ...report(), tokenMeta: {}, price: null, totalMarketLiquidity: null }, mint), null, 'nothing usable is nothing');
});

test('a report with figures but no holders is still worth having', () => {
  const reading = parseHolderReport({ ...report(), topHolders: [], totalHolders: 0, tokenMeta: { name: 'Solo', symbol: 'SOLO' }, price: 1 }, mint);
  assert.equal(reading.count, null);
  assert.deepEqual(reading.accounts, []);
  assert.equal(reading.meta.symbol, 'SOLO', 'a coin can be described without its holders being listed');
});

test('a refused or broken report is a missing answer, never a thrown scan failure', async () => {
  const { fetchHolderAccounts, resetHolderAccountCache } = await import('../dist/src/rugcheck.js');
  const oldFetch = globalThis.fetch;
  const calls = [];
  try {
    resetHolderAccountCache();
    // An established token is refused outright by this feed, which is not an error.
    globalThis.fetch = async url => { calls.push(String(url)); return new Response('bad request', { status: 400 }); };
    assert.equal(await fetchHolderAccounts(mint, Date.now()), null);

    // A refusal is remembered briefly, so the feed is not asked again immediately.
    resetHolderAccountCache();
    calls.length = 0;
    globalThis.fetch = async url => { calls.push(String(url)); return new Response(JSON.stringify(report()), { status: 200 }); };
    const at = Date.now();
    const first = await fetchHolderAccounts(mint, at);
    const second = await fetchHolderAccounts(mint, at + 1000);
    assert.equal(first.count, 21);
    assert.deepEqual(second, first, 'a cached report is reused');
    assert.equal(calls.filter(url => url.includes('rugcheck')).length, 1, 'and the feed is not asked twice');

    // A transport failure is handled the same way.
    resetHolderAccountCache();
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.equal(await fetchHolderAccounts(mint, Date.now()), null);
  } finally { globalThis.fetch = oldFetch; }
});
