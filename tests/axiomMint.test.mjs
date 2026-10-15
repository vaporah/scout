import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { axiomPageMint, mintFromAxiomUrl, mintCandidates, mintFromPulseRow, rowText } from '../dist/src/axiomMint.js';

const mint = '11111111111111111111111111111111';
const other = '22222222222222222222222222222222';

test('Axiom identity needs the real host, Solana route and full mint', () => {
  assert.equal(mintFromAxiomUrl(`/t/${mint}?chain=sol`), mint);
  assert.equal(mintFromAxiomUrl(`https://axiom.trade/meme/${mint}`), mint);
  assert.equal(mintFromAxiomUrl(`https://axiom.trade/t/${mint}?chain=bnb`), null);
  assert.equal(mintFromAxiomUrl(`https://axiom.trade.evil.example/t/${mint}`), null);
  assert.equal(mintFromAxiomUrl('https://axiom.trade/t/SCOUT'), null);
});

test('every Solana token route Axiom serves resolves to one exact mint', () => {
  for (const href of [
    `/token/${mint}`, `/coin/${mint}`, `/trade/${mint}`, `/pulse/${mint}`, `/pair/${mint}`,
    `/t/${mint}/chart`, `https://axiom.trade/?mint=${mint}`, `https://axiom.trade/?ca=${mint}`,
    `https://axiom.trade/#/t/${mint}`, `https://axiom.trade/t/${mint}?chain=sol&ref=pulse`
  ]) assert.equal(mintFromAxiomUrl(href), mint, href);
  assert.equal(mintFromAxiomUrl(`/token/${mint}?chain=eth`), null);
  assert.equal(mintFromAxiomUrl(`/t/${mint}/../${other}`), other, 'a deeper path still resolves one mint');
  assert.equal(mintFromAxiomUrl('https://other.example/t/' + mint), null);
});

test('the token chart still resolves on a route Axiom has renamed', () => {
  // The chart used to stop scanning entirely when Axiom renamed a route segment.
  assert.equal(axiomPageMint(`/terminal/${mint}`), mint);
  assert.equal(axiomPageMint(`https://axiom.trade/chart/${mint}?chain=sol`), mint);
  assert.equal(axiomPageMint(`/t/${mint}`), mint, 'the known routes keep working');
  assert.equal(axiomPageMint(`/meme/${mint}`), mint);
  assert.equal(axiomPageMint(`/#/t/${mint}`), mint);

  // Never a list page, and never a lookalike host or another chain.
  assert.equal(axiomPageMint('https://axiom.trade/pulse'), null, 'the pulse table has no mint in its path');
  assert.equal(axiomPageMint('https://axiom.trade/'), null);
  assert.equal(axiomPageMint(`/terminal/${mint}/${other}`), null, 'two mints in one path stay ambiguous');
  assert.equal(axiomPageMint(`/terminal/${mint}?chain=eth`), null);
  assert.equal(axiomPageMint(`https://axiom.trade.evil.example/terminal/${mint}`), null);
  assert.equal(axiomPageMint(`/terminal/SCOUT`), null);
});

test('the relaxed page rule never leaks into link parsing', () => {
  // A creator-wallet link is a valid base58 address too. If the relaxed rule applied
  // to links, a row carrying one would look like it named two mints and go uncoloured.
  const wallet = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
  assert.equal(mintFromAxiomUrl(`/wallet/${wallet}`), null, 'links stay strict');
  assert.equal(axiomPageMint(`/wallet/${wallet}`), wallet, 'the page rule is the forgiving one');
});

test('a mint is found in any attribute or short text node, never a whole table', () => {
  const dom = new JSDOM(`<div id="attr" data-v-abc="${mint}">COIN</div>
    <div id="text">copy CA: ${mint}</div>
    <div id="link"><a href="/t/${mint}?chain=sol">COIN</a></div>
    <div id="many" data-a="${mint}" data-b="${other}">COIN</div>
    <div id="none">COIN only</div>`, { url: 'https://axiom.trade/pulse' });
  try {
    const { document } = dom.window;
    assert.deepEqual([...mintCandidates(document.querySelector('#attr'))], [mint]);
    assert.deepEqual([...mintCandidates(document.querySelector('#text'))], [mint]);
    assert.deepEqual([...mintCandidates(document.querySelector('#link'))], [mint]);
    assert.equal(mintCandidates(document.querySelector('#many')).size, 2, 'conflicting attributes stay ambiguous');
    assert.equal(mintCandidates(document.querySelector('#none')).size, 0);
  } finally { dom.window.close(); }
});

test("Scout's own badge, tags and data attributes are never read back as identity", () => {
  const dom = new JSDOM(`<div id="row" data-scout-mint="${mint}" data-scout-status="TOP CANDIDATE" data-scout-buzz="High volume">
    <span>SAME</span><a href="/t/${other}?chain=sol">SAME</a>
    <span class="scout-pulse-badge" title="Scout \u00b7 ${mint} \u00b7 Score 96/100">SCOUT 96 \u00b7 TOP</span>
    <div class="scout-pulse-tags"><span class="scout-pulse-tag">pump.fun</span></div>
  </div>`, { url: 'https://axiom.trade/pulse' });
  try {
    const row = dom.window.document.querySelector('#row');
    assert.deepEqual([...mintCandidates(row)], [other], 'the painted row keeps the card\'s real identity');
    assert.equal(rowText(row).includes('SCOUT 96'), false, 'Scout UI is stripped from the row text');
  } finally { dom.window.close(); }
});

test('row-local links cannot substitute a same-name or conflicting coin', () => {
  const dom = new JSDOM(`<div id="one"><span>SCOUT</span><a href="/t/${mint}?chain=sol">Coin</a></div><div id="two"><span>SCOUT</span><a href="/t/${other}?chain=sol">Coin</a></div><div id="mixed"><a href="/t/${mint}"></a><a href="/t/${other}"></a></div>`, { url: 'https://axiom.trade/pulse' });
  try {
    assert.equal(mintFromPulseRow(dom.window.document.querySelector('#one')), mint);
    assert.equal(mintFromPulseRow(dom.window.document.querySelector('#two')), other);
    assert.equal(mintFromPulseRow(dom.window.document.querySelector('#mixed')), null);
  } finally { dom.window.close(); }
});
