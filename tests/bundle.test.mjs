import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { fetchTokens } from '../dist/src/provider.js';
import { assessTokens } from '../dist/src/analysis.js';
import { defaults } from '../dist/src/settings.js';

test('packaged classic content script starts on Pulse and paints an exact matched row', async () => {
  const mint = '11111111111111111111111111111111';
  const dom = new JSDOM(`<section><h2>New Pairs</h2><article id="coin"><a href="/t/${mint}?chain=sol">Coin</a></article></section>`, {
    url: 'https://axiom.trade/pulse', runScripts: 'outside-only'
  });
  const now = Date.now();
  const [sample] = await fetchTokens('demo', now);
  const [top] = assessTokens([{ ...sample, mint, provider: 'Verified fixture' }], defaults, now);
  const calls = [];
  dom.window.chrome = { runtime: {
    sendMessage(message, callback) { calls.push(message); callback({ assessments: [top], settings: defaults, errors: [] }); }
  } };
  try {
    const code = await readFile(new URL('../dist/axiomOverlay.js', import.meta.url), 'utf8');
    dom.window.eval(code);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(calls[0].type, 'SCOUT_ASSESS_MINTS');
    assert.deepEqual(Array.from(calls[0].mints), [mint]);
    assert.equal(dom.window.document.querySelector('#coin').classList.contains('scout-pulse-green'), true);
  } finally { dom.window.close(); }
});
