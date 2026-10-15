import test from 'node:test';
import assert from 'node:assert/strict';
import { devReputation, devStatus } from '../dist/src/developerReputation.js';

const token = dev => ({
  mint: '11111111111111111111111111111111', chain: 'solana', name: 'Base', symbol: 'BASE',
  stage: 'new', launchedAt: null, observedAt: Date.now(), priceUsd: null, marketCapUsd: null, fdvUsd: null,
  liquidityUsd: null, liquidityChangePct: null, priceChange5mPct: null, imageUrl: null,
  trades: [], holders: null, developer: dev, mintAuthority: null, freezeAuthority: null,
  transferRestriction: null, migrationProgressPct: null, provider: 'test'
});

test('a bad launch history is classified RISKY DEV', () => {
  const verdict = devReputation(token({ creator: 'creator11111111111111111111111111111', priorLaunches: 12, rapidFailures: 6, linkedSales: 2, source: 'verified', note: '' }));
  assert.ok(verdict);
  assert.equal(verdict.label, 'RISKY DEV');
  assert.equal(verdict.tone, 'orange');
  assert.ok(verdict.reasons.some(reason => /6 rapid failures/.test(reason)));
  assert.ok(verdict.reasons.some(reason => /2 creator-linked sale/.test(reason)));
});

test('missing creator evidence is classified UNKNOWN DEV', () => {
  const verdict = devReputation(token({ creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: '' }));
  assert.ok(verdict);
  assert.equal(verdict.label, 'UNKNOWN DEV');
  assert.equal(verdict.tone, 'neutral');
});

test('a clean verified record produces no negative verdict', () => {
  assert.equal(devReputation(token({ creator: 'creator11111111111111111111111111111', priorLaunches: 2, rapidFailures: 0, linkedSales: 0, source: 'verified', note: '' })), null);
});

test('dev status is good, risky or unknown for the popup', () => {
  assert.equal(devStatus(token({ creator: 'creator11111111111111111111111111111', priorLaunches: 2, rapidFailures: 0, linkedSales: 0, source: 'verified', note: '' })).label, 'GOOD DEV');
  assert.equal(devStatus(token({ creator: 'creator11111111111111111111111111111', priorLaunches: 12, rapidFailures: 6, linkedSales: 0, source: 'verified', note: '' })).label, 'RISKY DEV');
  assert.equal(devStatus(token({ creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: '' })).label, 'UNKNOWN DEV');
});
