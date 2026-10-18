import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSolFlow } from '../dist/src/solFlow.js';

const payload = overrides => ({ data: { attributes: {
  quote_token_price_usd: '100',
  net_buy_volume_usd: { m5: '500' },
  buy_volume_usd: { m5: '1200' },
  sell_volume_usd: { m5: '700' },
  ...overrides
} } });

test('pool flow converts the exact five-minute buy and sell breakdown into SOL', () => {
  assert.deepEqual(parseSolFlow(payload({}), 'SOL', 123), {
    netSol: 5, buySol: 12, sellSol: 7, observedAt: 123,
    source: 'GeckoTerminal exact-pool 5m volume breakdown'
  });
});

test('pool flow never guesses from total volume or a non-SOL quote', () => {
  assert.equal(parseSolFlow(payload({ net_buy_volume_usd: {}, buy_volume_usd: {}, sell_volume_usd: {}, volume_usd: { m5: '5000' } }), 'SOL', 123), null);
  assert.equal(parseSolFlow(payload({}), 'USDC', 123), null);
  assert.equal(parseSolFlow(payload({ quote_token_price_usd: '0' }), 'SOL', 123), null);
});

test('pool flow derives net volume when the provider publishes only both sides', () => {
  const value = parseSolFlow(payload({ net_buy_volume_usd: {} }), 'WSOL', 123);
  assert.equal(value.netSol, 5);
  assert.equal(value.buySol, 12);
  assert.equal(value.sellSol, 7);
});
