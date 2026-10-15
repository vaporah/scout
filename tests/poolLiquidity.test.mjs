import test from 'node:test';
import assert from 'node:assert/strict';
import { solPoolReading } from '../dist/src/poolLiquidity.js';

const token = overrides => ({
  quoteSymbol: 'SOL', liquiditySol: null, liquidityUsd: 20000, dexName: 'pumpswap', ...overrides
});

test('SOL pool reading uses only an exact published quote reserve', () => {
  assert.deepEqual(solPoolReading(token({ liquiditySol: 146.06228 })), {
    short: '146.062 SOL', detail: '146.062 SOL', exact: true
  });
});

test('SOL pool reading explains pre-migration and unavailable reserves', () => {
  assert.deepEqual(solPoolReading(token({ dexName: 'pumpfun', liquidityUsd: null })), {
    short: 'Pre-LP', detail: 'Pre-migration bonding curve; no liquidity pool yet', exact: false
  });
  assert.equal(solPoolReading(token({})).detail, 'Exact SOL reserve not published by the pool source');
  assert.equal(solPoolReading(token({ quoteSymbol: 'USDC' })).detail, 'Not a SOL pool; quoted in USDC');
});
