import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGmgnStats } from '../dist/src/gmgnStat.js';

/** The shape the endpoint actually returns: rates are fractions in strings. */
function payload(data = {}) {
  return { code: 0, reason: '', message: 'success', data: { holder_count: 1214, top_10_holder_rate: '0.2122', creator_hold_rate: '0.0186', ...data } };
}

test('rates arrive as fractions in strings and become percentages', () => {
  const stats = parseGmgnStats(payload());
  assert.equal(stats.holderCount, 1214);
  assert.equal(stats.top10Pct, 21.22);
  assert.equal(stats.creatorHoldingPct, 1.86);
});

test('a top-ten rate of zero is not published, because on some coins it means uncomputed', () => {
  // This source reports 0 for a token whose pool holds almost everything, so a zero here
  // would understate concentration — the dangerous direction for a risk readout.
  const stats = parseGmgnStats(payload({ top_10_holder_rate: '0' }));
  assert.equal(stats.top10Pct, null);
  assert.equal(stats.holderCount, 1214, 'the rest of the payload is still used');
});

test('a deployer holding nothing is reported as zero, not as unknown', () => {
  // Unlike the top-ten rate, this is a statement about one wallet and is trustworthy.
  const stats = parseGmgnStats(payload({ creator_hold_rate: '0' }));
  assert.equal(stats.creatorHoldingPct, 0);
});

test('a rate outside the fraction range is unknown rather than assumed', () => {
  // Reading 21.22 as a fraction would report 2122%; guessing it means percent is a guess.
  assert.equal(parseGmgnStats(payload({ top_10_holder_rate: '21.22' })).top10Pct, null);
  assert.equal(parseGmgnStats(payload({ top_10_holder_rate: '-0.5' })).top10Pct, null);
  assert.equal(parseGmgnStats(payload({ top_10_holder_rate: 'not a number' })).top10Pct, null);
});

test('a holder count of zero is not a claim that nobody holds the coin', () => {
  const stats = parseGmgnStats(payload({ holder_count: 0 }));
  assert.equal(stats.holderCount, null);
  assert.equal(stats.top10Pct, 21.22);
});

test('a failed or empty response is a missing answer, not a wrong one', () => {
  assert.equal(parseGmgnStats(null), null);
  assert.equal(parseGmgnStats({}), null);
  assert.equal(parseGmgnStats({ code: 40000300, data: {} }), null, 'the endpoint reports failures in its own envelope');
  assert.equal(parseGmgnStats({ code: 0, data: { holder_count: null, top_10_holder_rate: null, creator_hold_rate: null } }), null);
});

test('a payload with only some figures still contributes those', () => {
  const stats = parseGmgnStats({ code: 0, data: { holder_count: 42 } });
  assert.deepEqual(stats, { holderCount: 42, top10Pct: null, creatorHoldingPct: null, quality: null });
});

test('wallet quality is read: who is holding, not how much', () => {
  const stats = parseGmgnStats({ code: 0, data: {
    creator_created_count: 28,
    top_bundler_trader_percentage: '0.0341',
    top70_sniper_hold_rate: '0.1495',
    bot_degen_rate: '0.5775',
    fresh_wallet_rate: '0.115'
  } });
  assert.deepEqual(stats.quality, {
    devLaunches: 28, bundlerPct: 3.41, sniperPct: 14.95, botDegenPct: 57.75, freshWalletPct: 11.5
  }, 'converted shares come out as clean numbers');
  assert.equal(stats.holderCount, null, 'quality alone is still a usable answer');
});

test('a first-time deployer reads as zero launches, not as an unknown deployer', () => {
  // "This creator has never launched before" is a fact worth showing.
  assert.equal(parseGmgnStats({ code: 0, data: { creator_created_count: 0 } }).quality.devLaunches, 0);
  // With no figures at all there is no reading to return, rather than an empty one.
  assert.equal(parseGmgnStats({ code: 0, data: {} }), null);
});

test('a zero share of bots or snipers is left unknown rather than read as clean', () => {
  // These measure how much supply sits in questionable hands: an understated reading is
  // the dangerous direction, so a zero is not treated as a clean bill of health.
  const stats = parseGmgnStats({ code: 0, data: { bot_degen_rate: '0', top70_sniper_hold_rate: '0', top_bundler_trader_percentage: '0', fresh_wallet_rate: '0' } });
  assert.equal(stats, null, 'nothing trustworthy to report');
  const partial = parseGmgnStats({ code: 0, data: { bot_degen_rate: '0', fresh_wallet_rate: '0.2' } });
  assert.equal(partial.quality.botDegenPct, null);
  assert.equal(partial.quality.freshWalletPct, 20);
});
