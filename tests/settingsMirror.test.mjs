import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { defaults } from '../dist/src/settings.js';

test('saved companion thresholds are mirrored for the Pulse worker', async () => {
  const dom = new JSDOM('', { url: 'https://scout.test/' });
  const priorStorage = globalThis.localStorage;
  const priorChrome = globalThis.chrome;
  const writes = [];
  globalThis.localStorage = dom.window.localStorage;
  globalThis.chrome = { storage: { local: { set: async value => { writes.push(value); } } } };
  try {
    const { saveSettings, loadSettings } = await import('../dist/src/ui.js?settings-mirror-test');
    const requested = { ...defaults, minScore: 82 };
    saveSettings(requested);
    assert.equal(loadSettings().minScore, 82);
    assert.equal(writes.at(-1)['scout.settings.v1'].minScore, 82);
  } finally {
    globalThis.localStorage = priorStorage;
    globalThis.chrome = priorChrome;
    dom.window.close();
  }
});
