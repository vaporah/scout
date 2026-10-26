import test from 'node:test';
import assert from 'node:assert/strict';
import { coinRead } from '../dist/src/coinRead.js';
import { assessTokens } from '../dist/src/analysis.js';
import { fetchTokens } from '../dist/src/provider.js';
import { defaults } from '../dist/src/settings.js';

async function assessment(overrides = {}) {
  const now = Date.now();
  const [sample] = await fetchTokens('demo', now);
  return assessTokens([{ ...sample, ...overrides }], defaults, now)[0];
}

test('coin read connects strong demand to pool turnover without predicting price', async () => {
  const a = await assessment({ liquidityUsd: 500 });
  const read = coinRead(a);
  assert.match(read.demand, /buys lead/i);
  assert.match(read.demand, /pool liquidity/i);
  assert.match(read.execution, /liquidity/i);
  assert.match(read.evidence, /evidence coverage/i);
  assert.doesNotMatch(`${read.headline} ${read.demand}`, /will|guarantee|moon/i);
});

test('critical evidence always dominates attractive market activity', async () => {
  const a = await assessment({ freezeAuthority: true });
  const read = coinRead(a);
  assert.equal(read.tone, 'red');
  assert.match(read.headline, /Critical risk outweighs/i);
});

test('missing market and safety evidence stays explicitly unknown', async () => {
  const a = await assessment({
    liquidityUsd: null,
    marketSnapshot: undefined,
    trades: [],
    mintAuthority: null,
    freezeAuthority: null,
    transferRestriction: null,
    developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown' }
  });
  const read = coinRead(a);
  assert.equal(read.tone, 'neutral');
  assert.match(read.demand, /not published/i);
  assert.match(read.execution, /unknown/i);
  assert.match(read.evidence, /incomplete/i);
});
