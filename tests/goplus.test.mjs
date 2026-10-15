import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDexPairs } from '../dist/src/dex.js';
import { enrichTokensWithGoPlus, parseGoPlusSecurity } from '../dist/src/goplus.js';
import { assessTokens } from '../dist/src/analysis.js';
import { defaults } from '../dist/src/settings.js';

const mint = '11111111111111111111111111111111';
const other = '22222222222222222222222222222222';
const third = '33333333333333333333333333333333';
const wallet = '44444444444444444444444444444444';
const security = { mintable: { status: '0' }, freezable: { status: '0' }, non_transferable: '0', default_account_state: '1', transfer_hook: [], transfer_fee: {}, balance_mutable_authority: { status: '0' }, closable: { status: '0' }, default_account_state_upgradable: { status: '0' }, transfer_hook_upgradable: { status: '0' }, transfer_fee_upgradable: { status: '0' }, holder_count: '1', holders: [{ account: wallet, percent: '0.25' }] };

function token(address, now) {
  return parseDexPairs([{ chainId: 'solana', baseToken: { address, symbol: 'SAME', name: 'Same ticker' }, liquidity: { usd: 30000 }, priceChange: { m5: 5 } }], address, now);
}

test('GoPlus parses only an exact mint and preserves unknown creator evidence', () => {
  const fields = parseGoPlusSecurity({ code: 1, result: { [other]: { ...security, mintable: { status: '1' } }, [mint]: security } }, mint);
  assert.equal(fields.mintAuthority, false);
  assert.equal(fields.freezeAuthority, false);
  assert.equal(fields.transferRestriction, false);
  assert.deepEqual(fields.holders, [{ wallet, pct: 25, type: 'wallet', tag: null, locked: false }]);
  assert.equal(fields.holderCount, 1);
  assert.equal(parseGoPlusSecurity({ code: 1, result: { [other]: security } }, mint), null);
  const mixedCaseMint = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
  assert.equal(parseGoPlusSecurity({ code: 1, result: { [mixedCaseMint.toLowerCase()]: security } }, mixedCaseMint), null);
  assert.equal(parseGoPlusSecurity({ code: 1, result: { [mint]: { mintable: { status: 'unknown' }, holders: [{ account: wallet, percent: '' }] } } }, mint), null);
});

test('a holder breakdown is only trusted when the reported count agrees with it', () => {
  const wallets = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A'].map(c => c.repeat(32));
  const ten = wallets.map((account, index) => ({ account, percent: String((10 - index) / 100) }));
  const full = parseGoPlusSecurity({ code: 1, result: { [mint]: { ...security, holder_count: '250', holders: ten } } }, mint);
  assert.equal(full.holders.length, 10);
  assert.equal(full.holderCount, 250);
  assert.equal(full.holders[0].pct, 10, 'a fraction of supply is reported as a percent');
  assert.equal(full.holders[9].pct, 1);

  // Nine rows against a count of 250 is a truncated response, not "the top nine".
  const truncated = parseGoPlusSecurity({ code: 1, result: { [mint]: { ...security, holder_count: '250', holders: ten.slice(0, 9) } } }, mint);
  assert.equal(truncated.holders, null);
  assert.equal(truncated.holderCount, null);
  // A brand new token with nine holders and a count of nine is complete and usable.
  const young = parseGoPlusSecurity({ code: 1, result: { [mint]: { ...security, holder_count: '9', holders: ten.slice(0, 9) } } }, mint);
  assert.equal(young.holders.length, 9);

  // Percentages that cannot be a share of supply are refused outright.
  assert.equal(parseGoPlusSecurity({ code: 1, result: { [mint]: { ...security, holder_count: '250', holders: [{ account: wallets[0], percent: '4.5' }] } } }, mint).holders, null);
  assert.equal(parseGoPlusSecurity({ code: 1, result: { [mint]: { ...security, holder_count: '250', holders: [{ account: 'not-a-mint', percent: '0.1' }] } } }, mint).holders, null);
  // Duplicates would overstate concentration.
  assert.equal(parseGoPlusSecurity({ code: 1, result: { [mint]: { ...security, holder_count: '250', holders: [{ account: wallets[0], percent: '0.1' }, { account: wallets[0], percent: '0.1' }] } } }, mint).holders, null);
  // No holders at all stays unknown rather than becoming an empty list.
  assert.equal(parseGoPlusSecurity({ code: 1, result: { [mint]: { ...security, holders: [] } } }, mint).holders, null);
});

test('a locked or provider-tagged holder keeps that label', () => {
  const lockedWallet = '5'.repeat(32);
  const fields = parseGoPlusSecurity({
    code: 1,
    result: { [mint]: { ...security, holder_count: '1', holders: [{ account: lockedWallet, percent: '0.4', is_locked: 1, tag: 'Treasury' }] } }
  }, mint);
  assert.equal(fields.holders[0].locked, true);
  assert.equal(fields.holders[0].tag, 'Treasury');
  assert.equal(fields.holders[0].pct, 40);
  assert.equal(fields.holders[0].type, 'wallet', 'an unlabelled address is never assumed to be a pool or a burn');
});

test('GoPlus distinguishes a proven transfer block from hooks, fees and upgrade powers', () => {
  const risky = parseGoPlusSecurity({ code: 1, result: { [mint]: { ...security, freezable: { status: '1' }, transfer_hook: [{ program: wallet }] } } }, mint);
  assert.equal(risky.freezeAuthority, true);
  assert.equal(risky.transferRestriction, null);
  assert.equal(parseGoPlusSecurity({ code: 1, result: { [mint]: { ...security, non_transferable: '1' } } }, mint).transferRestriction, true);
  assert.equal(parseGoPlusSecurity({ code: 1, result: { [mint]: { ...security, transfer_fee: { basis_points: 25 } } } }, mint).transferRestriction, null);
  assert.equal(parseGoPlusSecurity({ code: 1, result: { [mint]: { ...security, closable: { status: '1' } } } }, mint).transferRestriction, null);
  const now = Date.now();
  const input = token(mint, now);
  const [assessment] = assessTokens([{ ...input, ...risky }], defaults, now, new Set([mint]));
  assert.equal(assessment.status, 'DISQUALIFIED');
  assert.equal(assessment.token.developer.creator, null);
});

test('GoPlus enrichment caches exact mints and backs off after 429', async () => {
  const oldFetch = globalThis.fetch;
  const now = Date.now();
  const requested = [];
  globalThis.fetch = async url => {
    const address = new URL(url).searchParams.get('contract_addresses');
    requested.push(address);
    if (address === other) return new Response('', { status: 429, headers: { 'Retry-After': '10' } });
    return new Response(JSON.stringify({ code: 1, result: { [address]: security } }), { status: 200 });
  };
  try {
    const first = await enrichTokensWithGoPlus([token(mint, now)], now);
    assert.equal(first[0].freezeAuthority, false);
    assert.equal(first[0].holders[0].pct, 25);
    assert.equal(first[0].developer.creator, null);
    assert.match(first[0].developer.note, /Creator identity and launch history remain unverified/);
    assert.match(first[0].provider, /GoPlus security/);
    await enrichTokensWithGoPlus([token(mint, now + 1000)], now + 1000);
    assert.deepEqual(requested, [mint]);
    const limited = await enrichTokensWithGoPlus([token(other, now + 2000)], now + 2000);
    assert.equal(limited[0].freezeAuthority, null);
    const deferred = await enrichTokensWithGoPlus([token(third, now + 3000)], now + 3000);
    assert.equal(deferred[0].freezeAuthority, null);
    assert.deepEqual(requested, [mint, other]);
    const resumed = await enrichTokensWithGoPlus([token(third, now + 13_000)], now + 13_000);
    assert.equal(resumed[0].freezeAuthority, false);
    assert.deepEqual(requested, [mint, other, third]);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
