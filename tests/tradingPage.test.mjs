import test from 'node:test';
import assert from 'node:assert/strict';
import { tradingPageIdentity } from '../dist/src/tradingPage.js';

const mint = 'So11111111111111111111111111111111111111112';

test('popup token identity supports each platform independently', () => {
  assert.deepEqual(tradingPageIdentity(`https://axiom.trade/t/${mint}?chain=sol`), { platform: 'Axiom', mint });
  assert.deepEqual(tradingPageIdentity(`https://gmgn.ai/sol/token/${mint}`), { platform: 'GMGN', mint });
  assert.deepEqual(tradingPageIdentity(`https://trade.padre.gg/trade/solana/${mint}`), { platform: 'Padre', mint });
});

test('popup identity rejects lists, lookalikes, and ticker-only routes', () => {
  assert.equal(tradingPageIdentity('https://axiom.trade/pulse'), null);
  assert.equal(tradingPageIdentity('https://gmgn.ai/sol/trenches'), null);
  assert.equal(tradingPageIdentity('https://trade.padre.gg/trenches'), null);
  assert.equal(tradingPageIdentity(`https://trade.padre.gg.evil.test/trade/solana/${mint}`), null);
});
