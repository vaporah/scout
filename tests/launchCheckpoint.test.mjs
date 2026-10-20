import test from 'node:test';
import assert from 'node:assert/strict';
import { resetLaunchCheckpoints, trackLaunchCheckpoints } from '../dist/src/launchCheckpoint.js';

const mint = '11111111111111111111111111111111';
const token = (now, priceUsd, marketCapUsd) => ({
  mint, chain: 'solana', name: 'Minute', symbol: 'MIN', stage: 'new', launchedAt: now, observedAt: now,
  priceUsd, marketCapUsd, fdvUsd: marketCapUsd, liquidityUsd: 10_000, liquidityChangePct: null,
  priceChange5mPct: null, imageUrl: null, trades: [], holders: null,
  developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: '' },
  mintAuthority: null, freezeAuthority: null, transferRestriction: null, migrationProgressPct: null, provider: 'fixture'
});

test('60-second checkpoint is measured from Scout first seeing the exact mint', () => {
  resetLaunchCheckpoints();
  const now = Date.now();
  const [first] = trackLaunchCheckpoints([token(now, 1, 10_000)], now);
  assert.equal(first.launchCheckpoint.capturedAt, null);
  assert.equal(first.launchCheckpoint.dueAt, now + 60_000);

  const [early] = trackLaunchCheckpoints([token(now + 59_000, 2, 15_000)], now + 59_000);
  assert.equal(early.launchCheckpoint.capturedAt, null);

  const [done] = trackLaunchCheckpoints([token(now + 60_000, 1.5, 12_500)], now + 60_000);
  assert.equal(done.launchCheckpoint.priceChangePct, 50);
  assert.equal(done.launchCheckpoint.marketCapChangePct, 25);
  assert.equal(done.launchCheckpoint.firstObservedAt, now);
});

test('missing prices stay unknown instead of becoming zero performance', () => {
  resetLaunchCheckpoints();
  const now = Date.now();
  trackLaunchCheckpoints([token(now, null, null)], now);
  const [done] = trackLaunchCheckpoints([token(now + 60_000, 1, 10_000)], now + 60_000);
  assert.equal(done.launchCheckpoint.priceChangePct, null);
  assert.equal(done.launchCheckpoint.marketCapChangePct, null);
});
