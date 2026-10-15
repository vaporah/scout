import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { assessTokens } from '../dist/src/analysis.js';
import { collectGmgnRows, createGmgnOverlay } from '../dist/src/gmgnOverlay.js';
import { fetchTokens } from '../dist/src/provider.js';
import { defaults } from '../dist/src/settings.js';

const mint = '11111111111111111111111111111111';
const other = '22222222222222222222222222222222';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Poll until a condition holds instead of sleeping a fixed number of milliseconds.
 * The overlay paints from timer-driven scans, so a fixed sleep is a race that a
 * loaded machine loses. The budget is generous because the overlay's own refresh
 * interval is what gates progress, not this helper.
 */
async function waitFor(predicate, label, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await delay(10);
  }
  assert.fail(`timed out after ${timeoutMs}ms waiting for ${label}`);
}

function page(html) {
  return new JSDOM(html, { url: 'https://gmgn.ai/sol/trenches' });
}

test('GMGN row discovery keys rows by full mint links and ignores tickers', () => {
  const dom = page(`<main>
    <div><a href="/sol/token/${mint}">Coin</a><img src="x"><button>Buy</button></div>
    <div><a href="/sol/token/${other}">Other</a><img src="x"><button>Buy</button></div>
    <div><a href="/sol/token/SHORT">Ticker only</a></div>
    <div><a href="https://gmgn.ai.evil.test/sol/token/${mint}">Impostor host</a></div>
  </main>`);
  try {
    const rows = collectGmgnRows(dom.window.document);
    assert.deepEqual(rows.map(row => row.mint).sort(), [mint, other].sort());
  } finally { dom.window.close(); }
});

test('GMGN overlay paints a verified exact match and clears a removed row', async () => {
  const dom = page(`<main><div id="row"><a href="/sol/token/${mint}">Coin</a><img src="x"><button>Buy</button></div></main>`);
  const now = Date.now();
  const [sample] = await fetchTokens('demo', now);
  const [top] = assessTokens([{ ...sample, mint, provider: 'Verified fixture' }], defaults, now);
  assert.equal(top.status, 'TOP CANDIDATE');
  const overlay = createGmgnOverlay({
    document: dom.window.document,
    request: async () => ({ assessments: [top], settings: defaults }),
    debounceMs: 0
  });
  try {
    overlay.start();
    const row = dom.window.document.querySelector('#row');
    await waitFor(() => row.classList.contains('scout-pulse-green'), 'the first scan to paint the row');
    assert.equal(row.dataset.scoutMint, mint);
    assert.equal(row.querySelector('.scout-pulse-badge')?.textContent, `SCOUT ${top.score} \u00b7 TOP`);
    row.remove();
    await waitFor(() => !row.classList.contains('scout-pulse-row'), 'a removed row to be cleared');
    assert.equal(row.classList.contains('scout-pulse-green'), false);
  } finally { overlay.stop(); dom.window.close(); }
});

test('GMGN rows open the same hover popup Axiom Pulse has, badge and all', async () => {
  const dom = page(`<main><div id="row"><a href="/sol/token/${mint}">Coin</a><img src="x"><button>Buy</button></div></main>`);
  const now = Date.now();
  const [sample] = await fetchTokens('demo', now);
  const [top] = assessTokens([{ ...sample, mint, symbol: 'FINCH', provider: 'Verified fixture' }], defaults, now);
  const overlay = createGmgnOverlay({
    document: dom.window.document,
    request: async () => ({ assessments: [top], settings: defaults }),
    debounceMs: 0
  });
  try {
    overlay.start();
    const document_ = dom.window.document;
    const row = document_.querySelector('#row');
    await waitFor(() => row.classList.contains('scout-pulse-green'), 'the row to be assessed before hovering');
    const tip = document_.querySelector('.scout-pulse-tooltip');
    assert.ok(tip, 'the hover popup is created for GMGN too');
    assert.equal(tip.classList.contains('is-visible'), false, 'and stays hidden until a row is hovered');

    row.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
    await waitFor(() => tip.classList.contains('is-visible'), 'the popup to open on hover');
    assert.match(tip.querySelector('.scout-pulse-tooltip-heading')?.textContent ?? '', /Scout/);
    assert.equal(tip.querySelector('.scout-pulse-tooltip-symbol')?.textContent, 'FINCH');
    assert.ok(tip.querySelector('.scout-pulse-tooltip-mark img'), 'the popup carries the Scout mascot badge');
    assert.equal(tip.dataset.scoutTone, 'green', 'the badge colour follows the row verdict');

    // Leaving the row closes it again after the grace period.
    row.querySelector('a').dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, relatedTarget: document_.body }));
    await waitFor(() => !tip.classList.contains('is-visible'), 'the popup to close after the grace period');

    overlay.stop();
    assert.equal(document_.querySelector('.scout-pulse-tooltip'), null, 'stopping the overlay removes the popup');
  } finally { overlay.stop(); dom.window.close(); }
});
