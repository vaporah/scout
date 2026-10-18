import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGeckoTokenInfo } from '../dist/src/tokenInfo.js';

const mint = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const other = 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm';
const developer = 'ERo5RiMfU5GcuWwmikUr6ZpcCGy79nmMrpmTak6DmDQG';

const payload = attributes => ({ data: { id: `solana_${mint}`, type: 'token', attributes: { address: mint, symbol: 'BONK', ...attributes } } });

test('the feed supplies holder bands and the developer share', () => {
  const info = parseGeckoTokenInfo(payload({
    holders: { count: 1024748, distribution_percentage: { top_10: '38.3018', '11_20': '12.024', '21_40': '12.119', rest: '37.5552' }, last_updated: '2026-10-10T01:28:42Z' },
    developer_address: developer,
    developer_holding_percentage: 4.25
  }), mint);
  assert.equal(info.holderCount, 1024748);
  assert.deepEqual(info.bands, { top10: 38.3018, next10: 12.024, mid: 12.119, rest: 37.5552 });
  assert.equal(info.developerAddress, developer);
  assert.equal(info.developerHoldingPct, 4.25);
});

test('a developer holding of zero is an answer, not a missing value', () => {
  const info = parseGeckoTokenInfo(payload({ developer_holding_percentage: 0 }), mint);
  assert.equal(info.developerHoldingPct, 0, 'the dev sold, which is worth showing as 0%');
  assert.equal(parseGeckoTokenInfo(payload({ developer_holding_percentage: '' }), mint), null, 'an empty field is missing');
});

test('absent fields stay unknown instead of becoming zero', () => {
  const bare = parseGeckoTokenInfo(payload({}), mint);
  assert.equal(bare, null, 'a payload with nothing usable reports nothing');
  const partial = parseGeckoTokenInfo(payload({ holders: { count: 500 } }), mint);
  assert.equal(partial.holderCount, 500);
  assert.equal(partial.bands, null, 'no bands published means no bands, not zeroes');
  assert.equal(partial.developerAddress, null);
  assert.equal(partial.developerHoldingPct, null);
  // A bands object whose values are all null is treated as absent.
  const emptyBands = parseGeckoTokenInfo(payload({ holders: { count: 500, distribution_percentage: { top_10: null, '11_20': null, '21_40': null, rest: null } } }), mint);
  assert.equal(emptyBands.bands, null);
});

test('impossible or malformed values are refused rather than shown', () => {
  for (const bad of [-1, 101, 'not a number', {}, []]) {
    assert.equal(parseGeckoTokenInfo(payload({ developer_holding_percentage: bad }), mint), null, `holding ${JSON.stringify(bad)}`);
  }
  const badCount = parseGeckoTokenInfo(payload({ holders: { count: -5 } }), mint);
  assert.equal(badCount, null, 'a negative holder count is not usable');
  const badAddress = parseGeckoTokenInfo(payload({ developer_address: 'not-a-mint' }), mint);
  assert.equal(badAddress, null, 'a malformed developer address is dropped');
});

test("another token's info is never attributed to this mint", () => {
  const wrong = { data: { id: `solana_${other}`, type: 'token', attributes: { address: other, holders: { count: 999 }, developer_holding_percentage: 50 } } };
  assert.equal(parseGeckoTokenInfo(wrong, mint), null);
  assert.equal(parseGeckoTokenInfo(payload({}), 'not-a-mint'), null, 'the requested mint must be valid too');
  assert.equal(parseGeckoTokenInfo(null, mint), null);
  assert.equal(parseGeckoTokenInfo({ data: { attributes: null } }, mint), null);
});
