import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { collectPadreRows } from '../dist/src/padreOverlay.js';

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
