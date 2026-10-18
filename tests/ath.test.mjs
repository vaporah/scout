import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOhlcvAth } from '../dist/src/ath.js';

test('ATH parser takes the highest candle high and its time', () => {
  const payload = { data: { attributes: { ohlcv_list: [
    [1700000000, 0.001, 0.002, 0.0005, 0.0015, 10],
    [1700086400, 0.0015, 0.005, 0.001, 0.004, 20]
  ] } } };
  const ath = parseOhlcvAth(payload);
  assert.ok(ath);
  assert.equal(ath.priceUsd, 0.005);
  assert.equal(ath.at, 1700086400 * 1000);
  assert.match(ath.source, /GeckoTerminal/);
});

test('ATH parser returns null for unexpected payloads', () => {
  assert.equal(parseOhlcvAth({}), null);
  assert.equal(parseOhlcvAth({ data: { attributes: { ohlcv_list: [] } } }), null);
  assert.equal(parseOhlcvAth({ data: { attributes: { ohlcv_list: [[1, 2]] } } }), null);
});
