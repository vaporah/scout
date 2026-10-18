import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { fetchTokens } from '../dist/src/provider.js';
import { assessTokens } from '../dist/src/analysis.js';
import { defaults } from '../dist/src/settings.js';
import { renderPulseTooltip } from '../dist/src/pulseTooltip.js';

const mint = '11111111111111111111111111111111';

async function example(now) {
  const [sample] = await fetchTokens('demo', now);
  const [assessment] = assessTokens([{ ...sample, mint, provider: 'Verified fixture' }], defaults, now);
  return assessment;
}

function values(container) {
  return new Map([...container.querySelectorAll('.scout-pulse-tooltip-line')].map(line => [
    line.querySelector('.scout-pulse-tooltip-label')?.textContent,
    line.querySelector('.scout-pulse-tooltip-value')?.textContent
  ]));
}

test('tooltip gives an exact mint and actionable evidence without rendering untrusted source text as markup', async () => {
  const now = Date.now();
  const assessment = await example(now);
  assessment.token.provider = '<img src=x onerror=alert(1)>';
  assessment.token.developer = { ...assessment.token.developer, source: 'verified', creator: mint };
  assessment.critical = ['<script>unsafe</script>'];
  assessment.token.observedAt = now - 25_000;
  assessment.expiresAt = now + 30_000;
  const dom = new JSDOM('<div id="tip"></div>');
  try {
    const tip = dom.window.document.getElementById('tip');
    renderPulseTooltip(tip, assessment, mint, 'assessed', now);
    const facts = values(tip);
    assert.equal(facts.get('Mint'), mint);
    assert.match(facts.get('Score'), /\/100/);
    assert.equal(facts.get('Source'), '<img src=x onerror=alert(1)>');
    assert.equal(facts.get('Observed'), '25s ago');
    assert.match(facts.get('5m buys/sells'), /\d+ \/ \d+/);
    assert.match(facts.get('Security'), /Mint:/);
    assert.match(facts.get('Creator'), /Verified creator/);
    assert.equal(facts.get('Concern'), '<script>unsafe</script>');
    assert.equal(tip.querySelector('img, script'), null);
    assert.match(tip.querySelector('.scout-pulse-tooltip-heading').textContent, /Scout/);
  } finally { dom.window.close(); }
});

test('tooltip shows the exact SOL-side reserve when the pool source publishes it', async () => {
  const now = Date.now();
  const assessment = await example(now);
  assessment.token = { ...assessment.token, quoteSymbol: 'SOL', liquiditySol: 123.4567, solFlow5m: {
    netSol: 5.25, buySol: 8, sellSol: 2.75, observedAt: now, source: 'Verified fixture'
  } };
  const dom = new JSDOM('<div id="tip"></div>');
  try {
    const tip = dom.window.document.getElementById('tip');
    renderPulseTooltip(tip, assessment, mint, 'assessed', now);
    assert.equal(values(tip).get('SOL in pool'), '123.457 SOL');
    assert.equal(values(tip).get('5m SOL flow'), '+5.25 SOL net · 8 in · 2.75 out');
    assert.match([...tip.querySelectorAll('.scout-risk-verdict')].map(node => node.textContent).join(' '), /SOL pool123\.457 SOL/);
    assert.match([...tip.querySelectorAll('.scout-risk-verdict')].map(node => node.textContent).join(' '), /5m flow\+5\.25 SOL/);
  } finally { dom.window.close(); }
});

test('tooltip keeps the SOL pool result visible when a reserve is not published', async () => {
  const now = Date.now();
  const assessment = await example(now);
  assessment.token = { ...assessment.token, dexName: 'pumpfun', quoteSymbol: 'SOL', liquidityUsd: null, liquiditySol: null };
  const dom = new JSDOM('<div id="tip"></div>');
  try {
    const tip = dom.window.document.getElementById('tip');
    renderPulseTooltip(tip, assessment, mint, 'assessed', now);
    assert.equal(values(tip).get('SOL in pool'), 'Pre-migration bonding curve; no liquidity pool yet');
    assert.match([...tip.querySelectorAll('.scout-risk-verdict')].map(node => node.textContent).join(' '), /SOL poolPre-LP/);
  } finally { dom.window.close(); }
});

test('scanning and unknown states explain the scan instead of listing empty facts', () => {
  const dom = new JSDOM('<div id="tip"><span id="old">Old token</span></div>');
  try {
    const tip = dom.window.document.getElementById('tip');
    renderPulseTooltip(tip, null, mint, 'scanning');
    let facts = values(tip);
    assert.equal(tip.querySelector('#old'), null);
    assert.match(tip.querySelector('.scout-pulse-tooltip-heading').textContent, /scanning/);
    assert.equal(facts.get('Mint'), mint);
    assert.equal(facts.get('Status'), 'First lookup in flight');
    assert.equal(facts.get('Score'), undefined, 'no score is claimed before evidence exists');
    assert.doesNotMatch(tip.textContent, /Market & pool|Assessment/);

    renderPulseTooltip(tip, null, null, 'unknown');
    facts = values(tip);
    assert.match(tip.querySelector('.scout-pulse-tooltip-heading').textContent, /mint hidden/);
    assert.equal(facts.get('Mint'), 'Not readable from this card');
    assert.match(facts.get('Why'), /will not guess/);
    assert.doesNotMatch(tip.textContent, /Old token|NaN|undefined|Not scored/);
  } finally { dom.window.close(); }
});

test('a card without evidence still shows the live facts printed on the row', () => {
  const dom = new JSDOM('<div id="tip"></div>');
  try {
    const tip = dom.window.document.getElementById('tip');
    renderPulseTooltip(tip, null, null, 'unknown', Date.now(), {
      stage: 'new',
      readings: { symbol: 'FINCH', price: '$0.0000123', change: '-4.2%', age: '3m', marketCap: '$48.2K', liquidity: null, volume: '$21K', trades: '12 / 7' }
    });
    const facts = values(tip);
    assert.equal(facts.get('Price'), '$0.0000123');
    assert.equal(facts.get('Change'), '-4.2%');
    assert.equal(facts.get('Market cap'), '$48.2K');
    assert.equal(facts.get('Volume'), '$21K');
    assert.equal(facts.get('Trades'), '12 / 7');
    assert.equal(facts.get('Liquidity'), undefined, 'unprinted facts stay absent rather than Unknown');
    assert.match(tip.querySelector('.scout-pulse-tooltip-symbol').textContent, /FINCH/);
    assert.match(tip.textContent, /Live on this card/);
  } finally { dom.window.close(); }
});

test('unknown live fields stay unknown and an expired assessment is marked stale', async () => {
  const now = Date.now();
  const assessment = await example(now);
  assessment.token = {
    ...assessment.token,
    observedAt: now - 180_000,
    liquidityUsd: null,
    marketSnapshot: undefined,
    trades: [],
    developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: '' },
    mintAuthority: null, freezeAuthority: null, transferRestriction: null
  };
  assessment.concentrationPct = null;
  assessment.expiresAt = now - 90_000;
  const dom = new JSDOM('<div id="tip"></div>');
  try {
    const tip = dom.window.document.getElementById('tip');
    renderPulseTooltip(tip, assessment, mint, 'assessed', now);
    const facts = values(tip);
    assert.match(facts.get('Observed'), /3m ago.*stale/);
    assert.equal(facts.get('Liquidity'), 'Unknown');
    assert.equal(facts.get('5m volume'), 'Unknown');
    assert.equal(facts.get('Creator'), 'Unverified / unknown');
    assert.match(facts.get('Security'), /Mint: unknown.*Freeze: unknown.*Transfer: unknown/);
    assert.equal(facts.get('Top 10 holders'), 'Unknown');
  } finally { dom.window.close(); }
});

test('short mode hides the detail sections and an identical refresh never rebuilds the popup', async () => {
  const now = Date.now();
  const assessment = await example(now);
  const dom = new JSDOM('<div id="tip"></div>');
  try {
    const tip = dom.window.document.getElementById('tip');
    renderPulseTooltip(tip, assessment, mint, 'assessed', now, { stage: 'new' });
    assert.match(tip.textContent, /Market & pool/);

    // A refresh that produces the same facts must leave the live DOM untouched.
    const heading = tip.querySelector('.scout-pulse-tooltip-heading');
    renderPulseTooltip(tip, assessment, mint, 'assessed', now, { stage: 'new' });
    assert.equal(tip.querySelector('.scout-pulse-tooltip-heading'), heading);

    renderPulseTooltip(tip, assessment, mint, 'assessed', now, { stage: 'new', compact: true });
    assert.doesNotMatch(tip.textContent, /Market & pool|Token checks|Coin history/);
    assert.match(tip.textContent, /Assessment/);
    assert.match(tip.textContent, /Identity/);
    assert.match(tip.textContent, /Details hidden/);
    assert.match([...tip.querySelectorAll('.scout-risk-verdict')].map(node => node.textContent).join(' '), /Dev.*Volume.*Vamp/);
  } finally { dom.window.close(); }
});
