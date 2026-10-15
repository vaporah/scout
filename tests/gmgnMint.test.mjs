import test from 'node:test';
import assert from 'node:assert/strict';
import { isGmgnTokenPage, isGmgnTrenchesPage, mintFromGmgnUrl } from '../dist/src/gmgnMint.js';

const mint = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';

test('GMGN mint parsing accepts only full HTTPS token routes', () => {
  assert.equal(mintFromGmgnUrl(`https://gmgn.ai/sol/token/${mint}`), mint);
  assert.equal(mintFromGmgnUrl(`https://www.gmgn.ai/sol/token/${mint}?chain=sol`), mint);
  assert.equal(mintFromGmgnUrl(`https://gmgn.ai/sol/meme/${mint}`), mint);
  assert.equal(mintFromGmgnUrl('https://gmgn.ai/sol/trenches'), null);
  assert.equal(mintFromGmgnUrl('https://gmgn.ai/sol/token/SHORT'), null);
  assert.equal(mintFromGmgnUrl(`https://gmgn.ai.evil.test/sol/token/${mint}`), null);
  assert.equal(mintFromGmgnUrl(`http://gmgn.ai/sol/token/${mint}`), null);
});

test('GMGN page kind distinguishes token charts from the Trenches list', () => {
  assert.equal(isGmgnTokenPage(`https://gmgn.ai/sol/token/${mint}`), true);
  assert.equal(isGmgnTokenPage('https://gmgn.ai/sol/trenches'), false);
  assert.equal(isGmgnTrenchesPage('https://gmgn.ai/sol/trenches'), true);
  assert.equal(isGmgnTrenchesPage(`https://gmgn.ai/sol/token/${mint}`), false);
});
