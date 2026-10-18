import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { isPadreTokenPage, isPadreTrenchesPage, mintFromPadreUrl, padreDocumentMint } from '../dist/src/padreMint.js';

const mint = 'So11111111111111111111111111111111111111112';
const other = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6uRqx6c4K6pump';

test('Padre URLs require its HTTPS host and one full mint', () => {
  assert.equal(mintFromPadreUrl(`/trade/${mint}`), mint);
  assert.equal(mintFromPadreUrl(`https://trade.padre.gg/token/${mint}?chain=solana`), mint);
  assert.equal(mintFromPadreUrl(`https://trade.padre.gg/trenches?token=${mint}`), mint);
  assert.equal(mintFromPadreUrl(`https://trade.padre.gg.evil.test/token/${mint}`), null);
  assert.equal(mintFromPadreUrl(`http://trade.padre.gg/token/${mint}`), null);
  assert.equal(mintFromPadreUrl(`/trade/${mint}?wallet=${other}`), null);
  assert.equal(mintFromPadreUrl('/trade/SCOUT'), null);
});

test('Padre list and token routes stay distinct', () => {
  assert.equal(isPadreTrenchesPage('https://trade.padre.gg/trenches'), true);
  assert.equal(isPadreTokenPage(`https://trade.padre.gg/token/${mint}`), true);
  assert.equal(isPadreTokenPage('https://trade.padre.gg/trenches'), false);
});

test('Padre document fallback accepts one explicit chart mint but never a Trenches row', () => {
  const chart = new JSDOM(`<main data-token-address="${mint}"></main>`, { url: 'https://trade.padre.gg/chart' });
  assert.equal(padreDocumentMint(chart.window.document, chart.window.location.href), mint);
  chart.window.close();
  const trenches = new JSDOM(`<article data-token-address="${mint}"></article>`, { url: 'https://trade.padre.gg/trenches' });
  assert.equal(padreDocumentMint(trenches.window.document, trenches.window.location.href), null);
  trenches.window.close();
});
