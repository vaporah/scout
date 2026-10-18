import test from 'node:test';
import assert from 'node:assert/strict';
import { gmgnDocumentMint, isGmgnTokenPage, isGmgnTrenchesPage, mintFromGmgnUrl } from '../dist/src/gmgnMint.js';
import { JSDOM } from 'jsdom';

const mint = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';

test('GMGN mint parsing accepts only full HTTPS token routes', () => {
  assert.equal(mintFromGmgnUrl(`https://gmgn.ai/sol/token/${mint}`), mint);
  assert.equal(mintFromGmgnUrl(`https://www.gmgn.ai/sol/token/${mint}?chain=sol`), mint);
  assert.equal(mintFromGmgnUrl(`https://gmgn.ai/sol/meme/${mint}`), mint);
  assert.equal(mintFromGmgnUrl('https://gmgn.ai/sol/trenches'), null);
  assert.equal(mintFromGmgnUrl('https://gmgn.ai/sol/token/SHORT'), null);
  assert.equal(mintFromGmgnUrl(`https://gmgn.ai.evil.test/sol/token/${mint}`), null);
  assert.equal(mintFromGmgnUrl(`http://gmgn.ai/sol/token/${mint}`), null);
  assert.equal(mintFromGmgnUrl(`https://gmgn.ai/sol/trade/JUP?asset_id=${mint}`), mint);
});

test('GMGN page kind distinguishes token charts from the Trenches list', () => {
  assert.equal(isGmgnTokenPage(`https://gmgn.ai/sol/token/${mint}`), true);
  assert.equal(isGmgnTokenPage('https://gmgn.ai/sol/trenches'), false);
  assert.equal(isGmgnTrenchesPage('https://gmgn.ai/sol/trenches'), true);
  assert.equal(isGmgnTrenchesPage(`https://gmgn.ai/sol/token/${mint}`), false);
});

test('GMGN chart header keeps the mint during a temporary ticker-only route', () => {
  const dom = new JSDOM(`<button data-copy-value="${mint}">Copy CA</button>`, { url: 'https://gmgn.ai/sol/trade/JUP' });
  assert.equal(gmgnDocumentMint(dom.window.document, dom.window.location.href), mint);
  dom.window.close();
});

test('GMGN Trenches never promotes a visible card mint into a coin-page identity', () => {
  for (const url of ['https://gmgn.ai/?chain=sol', 'https://gmgn.ai/sol/trenches']) {
    const dom = new JSDOM(`<main><article data-token-address="${mint}"><a href="/sol/token/${mint}">Coin</a></article></main>`, { url });
    try {
      assert.equal(gmgnDocumentMint(dom.window.document, dom.window.location.href), null, url);
    } finally { dom.window.close(); }
  }
});
