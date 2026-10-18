import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultIntegrationPrefs, validIntegrationPrefs } from '../dist/src/integrationPrefs.js';

test('trading-page display preferences default on and validate stored switches', () => {
  assert.deepEqual(validIntegrationPrefs(null), defaultIntegrationPrefs);
  assert.deepEqual(validIntegrationPrefs({ coinPopups: false, rowHighlights: true }), {
    coinPopups: false,
    rowHighlights: true
  });
  assert.deepEqual(validIntegrationPrefs({ coinPopups: 'no', rowHighlights: 0 }), defaultIntegrationPrefs);
});
