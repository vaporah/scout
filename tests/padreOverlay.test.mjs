import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { collectPadreRows, mintFromPadreCard } from '../dist/src/padreOverlay.js';

const mint = 'So11111111111111111111111111111111111111112';
const other = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6uRqx6c4K6pump';

test('Padre Trenches cards are keyed by exact full mint links', () => {
  const dom = new JSDOM(`<main>
    <article id="one"><img><a href="/token/${mint}">SCOUT</a><button>Buy</button></article>
    <article id="two"><img><a href="/token/${other}">OTHER</a><button>Buy</button></article>
    <article id="bad"><img><a href="https://trade.padre.gg.evil.test/token/${mint}">FAKE</a></article>
  </main>`, { url: 'https://trade.padre.gg/trenches', pretendToBeVisual: true });
  const rows = collectPadreRows(dom.window.document);
  assert.deepEqual(rows.map(row => row.mint), [mint, other]);
  assert.deepEqual(rows.map(row => row.element.id), ['one', 'two']);
  dom.window.close();
});

test('Padre collector stays idle on a token page', () => {
  const dom = new JSDOM(`<article><a href="/token/${mint}">coin</a></article>`, {
    url: `https://trade.padre.gg/token/${mint}`, pretendToBeVisual: true
  });
  assert.deepEqual(collectPadreRows(dom.window.document), []);
  dom.window.close();
});

test('Padre card identity uses the primary launchpad contract, never its quote pill', () => {
  const dom = new JSDOM(`<main>
    <span id="wrapper">
      <button aria-label="Copy address">So1…1112</button>
      <div id="card">
        <a href="https://pump.fun/coin/${mint}?utm_source=terminal">PumpFun</a>
        <a href="/trade/solana/${other}?tpo=quotePill">QUOTE</a>
        <a href="https://x.com/search?q=${mint}">Search</a>
        <div role="group" aria-label="Audit">Audit</div>
      </div>
    </span>
  </main>`, { url: 'https://trade.padre.gg/trenches', pretendToBeVisual: true });
  const card = dom.window.document.getElementById('card');
  assert.equal(mintFromPadreCard(card), mint);
  const rows = collectPadreRows(dom.window.document);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mint, mint);
  assert.equal(rows[0].element.hasAttribute('data-scout-padre-card'), true);
  dom.window.close();
});
