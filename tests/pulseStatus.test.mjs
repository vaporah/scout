import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPulseStatus, savePulseStatus } from '../dist/src/pulseStatus.js';

test('Pulse status reports fresh row matches and rejects stale state', async () => {
  const prior = globalThis.chrome;
  const values = {};
  globalThis.chrome = { storage: { local: {
    async set(items) { Object.assign(values, items); },
    async get(key) { return { [key]: values[key] }; }
  } } };
  try {
    const now = Date.now();
    const status = { onPulse: true, visibleRows: 12, matchedRows: 9, colouredRows: 12, at: now };
    await savePulseStatus(status);
    assert.deepEqual(await loadPulseStatus(now + 1_000), status);
    assert.equal(await loadPulseStatus(now + 91_000), null);
    values['scout.pulseStatus.v1'] = { onPulse: true, matchedRows: 9, colouredRows: 3, at: now };
    assert.equal(await loadPulseStatus(now + 1_000), null);
  } finally { globalThis.chrome = prior; }
});
