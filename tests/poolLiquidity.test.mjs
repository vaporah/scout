import test from 'node:test';
import assert from 'node:assert/strict';
import { solFlowReading, solPoolReading } from '../dist/src/poolLiquidity.js';

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

test('SOL flow reading makes direction and both sides explicit', () => {
  assert.deepEqual(solFlowReading(token({ solFlow5m: {
    netSol: 5, buySol: 12, sellSol: 7, observedAt: 123, source: 'test'
  } })), {
    short: '+5 SOL', detail: '+5 SOL net · 12 in · 7 out', exact: true
  });
  assert.equal(solFlowReading(token({})).detail, 'Exact five-minute SOL flow not published yet');
});
