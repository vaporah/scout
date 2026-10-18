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

test('Axiom, GMGN, and Padre ship the same coin-panel and preference features', async () => {
  const [manifest, axiomToken, gmgn, padre] = await Promise.all([
    readFile(new URL('../dist/manifest.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../dist/tokenPage.js', import.meta.url), 'utf8'),
    readFile(new URL('../dist/gmgn.js', import.meta.url), 'utf8'),
    readFile(new URL('../dist/padre.js', import.meta.url), 'utf8')
  ]);
  const axiomEntry = manifest.content_scripts.find(entry => entry.matches.includes('https://axiom.trade/*'));
  const gmgnEntry = manifest.content_scripts.find(entry => entry.matches.includes('https://gmgn.ai/*'));
  const padreEntry = manifest.content_scripts.find(entry => entry.matches.includes('https://trade.padre.gg/*'));
  assert.deepEqual(gmgnEntry.css, axiomEntry.css, 'GMGN receives the shared panel and hover styles');
  assert.deepEqual(padreEntry.css, axiomEntry.css, 'Padre receives the shared panel and hover styles');
  for (const feature of [
    'Scout is gathering independent market, holder, and security data for this coin.',
    'scout.integrations.v1',
    'scout-risk',
    'NOT SCANNED YET'
  ]) {
    assert.ok(axiomToken.includes(feature), `Axiom includes ${feature}`);
    assert.ok(gmgn.includes(feature), `GMGN includes ${feature}`);
    assert.ok(padre.includes(feature), `Padre includes ${feature}`);
  }
});
