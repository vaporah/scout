import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { collectPulseRows, createAxiomPulseOverlay, mintFromVisiblePulseRow } from '../dist/src/axiomOverlay.js';
import { fetchTokens } from '../dist/src/provider.js';
import { assessTokens } from '../dist/src/analysis.js';
import { defaults } from '../dist/src/settings.js';

const one = '11111111111111111111111111111111';
const two = '22222222222222222222222222222222';
const three = '33333333333333333333333333333333';

function pulse(html) {
  return new JSDOM(html, { url: 'https://axiom.trade/pulse' });
}

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

test('Pulse adapter matches only complete row-local Solana identities across three stages', () => {
  const dom = pulse(`<main>
    <section><h2>New Pairs</h2><article id="one"><span>SCOUT</span><a href="/t/${one}?chain=sol">SCOUT</a></article>
      <article id="ticker">SCOUT</article>
      <div id="unmarked-conflict"><a href="/t/${one}">A</a><a href="/t/${two}">B</a></div></section>
    <section><h2>Final Stretch</h2><article id="two" data-token-mint="${two}">SCOUT</article>
      <article id="conflict" data-mint="${one}"><a href="/t/${two}?chain=sol">Another</a></article></section>
    <section><h2>Migrated</h2><article id="three"><a href="/meme/${three}?chain=sol">Third</a></article>
      <article id="wrong"><a href="https://axiom.trade.evil.test/t/${one}">Fake</a></article>
      <article id="hidden" hidden><a href="/t/${one}">Hidden</a></article></section>
  </main>`);
  try {
    const doc = dom.window.document;
    const rows = collectPulseRows(doc);
    assert.deepEqual(rows.map(row => row.mint), [one, two, three]);
    assert.deepEqual(rows.map(row => row.element.id), ['one', 'two', 'three']);
    assert.equal(mintFromVisiblePulseRow(doc.querySelector('#conflict')), null);
    assert.equal(mintFromVisiblePulseRow(doc.querySelector('#unmarked-conflict')), null);
    assert.equal(mintFromVisiblePulseRow(doc.querySelector('#ticker')), null);
    assert.equal(mintFromVisiblePulseRow(doc.querySelector('#hidden')), null);
    dom.reconfigure({ url: 'https://axiom.trade/t/' + one });
    assert.deepEqual(collectPulseRows(doc), []);
  } finally { dom.window.close(); }
});

test('live overlay paints a verified exact match and clears a recycled or removed card', async () => {
  const dom = pulse(`<main><section><h2>New Pairs</h2><article id="row"><a href="/t/${one}?chain=sol">SCOUT</a></article></section></main>`);
  const now = Date.now();
  const [sample] = await fetchTokens('demo', now);
  const token = { ...sample, mint: one, provider: 'Verified fixture' };
  const [top] = assessTokens([token], defaults, now);
  assert.equal(top.status, 'TOP CANDIDATE');
  const batches = [];
  const overlay = createAxiomPulseOverlay({
    document: dom.window.document,
    request: async mints => { batches.push(mints); return { assessments: [top], settings: defaults }; },
    debounceMs: 0, intervalMs: 15_000
  });
  try {
    overlay.start();
    await delay(10);
    const row = dom.window.document.querySelector('#row');
    assert.deepEqual(batches, [[one]]);
    assert.equal(row.classList.contains('scout-pulse-green'), true);
    assert.equal(row.querySelector('.scout-pulse-badge')?.textContent, `SCOUT ${top.score} \u00b7 TOP`);
    assert.match(row.querySelector('.scout-pulse-badge')?.title ?? '', /TOP CANDIDATE/);

    row.querySelector('a').setAttribute('href', `/t/${two}?chain=sol`);
    await delay(10);
    assert.equal(row.classList.contains('scout-pulse-green'), false);
    assert.equal(row.classList.contains('scout-pulse-neutral'), true);
    assert.equal(row.querySelector('.scout-pulse-badge')?.textContent, 'SCOUT \u00b7 SCANNING');
    assert.equal(row.dataset.scoutMint, undefined);

    row.remove();
    await delay(10);
    assert.equal(row.classList.contains('scout-pulse-row'), false);
  } finally { overlay.stop(); dom.window.close(); }
});

test('hovering a Pulse card opens the shared popup and leaving it closes the popup', async () => {
  const dom = pulse(`<main><section><h2>New Pairs</h2><article id="row"><a href="/t/${one}?chain=sol">SCOUT</a></article></section></main>`);
  const now = Date.now();
  const [sample] = await fetchTokens('demo', now);
  const [top] = assessTokens([{ ...sample, mint: one, symbol: 'FINCH', provider: 'Verified fixture', solFlow5m: {
    netSol: 5.25, buySol: 8, sellSol: 2.75, observedAt: now, source: 'Verified fixture'
  } }], defaults, now);
  const overlay = createAxiomPulseOverlay({
    document: dom.window.document,
    request: async () => ({ assessments: [top], settings: defaults }),
    debounceMs: 0, intervalMs: 15_000
  });
  try {
    overlay.start();
    const document_ = dom.window.document;
    const row = document_.querySelector('#row');
    await waitFor(() => row.classList.contains('scout-pulse-green'), 'the row to be assessed before hovering');
    assert.equal(row.querySelector('.scout-pulse-flow')?.textContent, '5m +5.25 SOL', 'Axiom Pulse shows flow directly on the card');
    const tip = document_.querySelector('.scout-pulse-tooltip');
    assert.ok(tip, 'the hover popup the GMGN overlay shares is created here too');
    assert.equal(tip.classList.contains('is-visible'), false);

    row.dispatchEvent(new dom.window.MouseEvent('mouseover', { bubbles: true }));
    await waitFor(() => tip.classList.contains('is-visible'), 'the popup to open on hover');
    assert.equal(tip.querySelector('.scout-pulse-tooltip-symbol')?.textContent, 'FINCH');
    assert.ok(tip.querySelector('.scout-pulse-tooltip-mark img'), 'the mascot badge survives the shared host');
    assert.equal(tip.dataset.scoutTone, 'green');
    assert.match(tip.textContent ?? '', /5m SOL flow\+5\.25 SOL net/);

    row.querySelector('a').dispatchEvent(new dom.window.MouseEvent('mouseout', { bubbles: true, relatedTarget: document_.body }));
    await waitFor(() => !tip.classList.contains('is-visible'), 'the popup to close after the grace period');

    overlay.stop();
    assert.equal(document_.querySelector('.scout-pulse-tooltip'), null, 'stopping the overlay removes the popup');
  } finally { overlay.stop(); dom.window.close(); }
});

test('missing scan result never preserves an old green highlight', async () => {
  const dom = pulse(`<section><h2>New Pairs</h2><article id="row"><a href="/t/${one}?chain=sol">Coin</a></article></section>`);
  const now = Date.now();
  const [sample] = await fetchTokens('demo', now);
  const [top] = assessTokens([{ ...sample, mint: one, provider: 'Verified fixture' }], defaults, now);
  let calls = 0;
  const overlay = createAxiomPulseOverlay({
    document: dom.window.document,
    request: async () => ({ assessments: ++calls === 1 ? [top] : [], settings: defaults }),
    debounceMs: 0, intervalMs: 100
  });
  try {
    overlay.start();
    const row = dom.window.document.querySelector('#row');
    await waitFor(() => row.classList.contains('scout-pulse-green'), 'the first scan to paint the row green');
    assert.equal(row.classList.contains('scout-pulse-green'), true);
    await waitFor(() => !row.classList.contains('scout-pulse-green'), 'the stale green highlight to clear');
    // Polled rather than checked immediately: the paint happens from timer-driven scans,
    // so the settled state is what this asserts. If the row never settled, this times out
    // and fails loudly, so it cannot hide a row that is genuinely left uncoloured.
    await waitFor(() => row.classList.contains('scout-pulse-gray'), 'the row to fall back to gray');
    await waitFor(() => row.querySelector('.scout-pulse-badge')?.textContent === 'SCOUT \u00b7 UNKNOWN', 'the badge to fall back to unknown');
  } finally { overlay.stop(); dom.window.close(); }
});

test('badge severity matches a red price-drop row even when overall status is wait', async () => {
  const dom = pulse(`<section><h2>New Pairs</h2><article id="row"><a href="/t/${one}?chain=sol">Coin</a></article></section>`);
  const now = Date.now();
  const [sample] = await fetchTokens('demo', now);
  const [top] = assessTokens([{ ...sample, mint: one, provider: 'Verified fixture' }], defaults, now);
  const priceDrop = { ...top, status: 'WAIT FOR CONFIRMATION', token: { ...top.token, priceChange5mPct: -30 } };
  const overlay = createAxiomPulseOverlay({ document: dom.window.document, request: async () => ({ assessments: [priceDrop], settings: defaults }) });
  try {
    overlay.start();
    await delay(10);
    const row = dom.window.document.querySelector('#row');
    assert.equal(row.classList.contains('scout-pulse-red'), true);
    assert.equal(row.querySelector('.scout-pulse-badge--red')?.textContent, 'SCOUT \u00b7 PRICE DROP');
  } finally { overlay.stop(); dom.window.close(); }
});

test('every visible Pulse card starts coloured while scanning and becomes unknown when the lookup has no assessment', async () => {
  const dom = pulse(`<main>
    <section><h2>New Pairs</h2><article id="new"><a href="/t/${one}?chain=sol">New</a></article>
      <article id="mintless"><img src="/coin.png" alt="Coin avatar"><span>MYSTERY</span><button>⚡ 0 SOL</button></article>
      <article id="hidden" hidden><a href="/t/${one}?chain=sol">Hidden</a></article>
    </section>
    <section><h2>Final Stretch</h2><article id="final"><a href="/t/${two}?chain=sol">Final</a></article></section>
    <section><h2>Migrated</h2><article id="migrated"><a href="/t/${three}?chain=sol">Migrated</a></article></section>
  </main>`);
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const calls = [];
  const overlay = createAxiomPulseOverlay({
    document: dom.window.document,
    request: mints => { calls.push(mints); return pending; },
    debounceMs: 0, intervalMs: 15_000
  });
  try {
    overlay.start();
    for (const id of ['new', 'final', 'migrated']) {
      const row = dom.window.document.getElementById(id);
      assert.equal(row.classList.contains('scout-pulse-neutral'), true, `${id} is visibly scanning`);
      assert.equal(row.querySelector('.scout-pulse-badge')?.textContent, 'SCOUT \u00b7 SCANNING');
    }
    assert.deepEqual(calls, [[one, two, three]]);
    const mintless = dom.window.document.getElementById('mintless');
    assert.equal(mintless.classList.contains('scout-pulse-gray'), true);
    assert.match(mintless.querySelector('.scout-pulse-badge')?.textContent ?? '', /MINT UNKNOWN/);
    assert.equal(mintless.classList.contains('scout-pulse-green'), false);
    assert.equal(dom.window.document.getElementById('hidden').classList.contains('scout-pulse-row'), false);

    finish({ assessments: [], settings: defaults });
    await delay(10);
    for (const id of ['new', 'final', 'migrated']) {
      const row = dom.window.document.getElementById(id);
      assert.equal(row.classList.contains('scout-pulse-gray'), true, `${id} has a fallback colour`);
      assert.equal(row.classList.contains('scout-pulse-neutral'), false);
      assert.equal(row.querySelector('.scout-pulse-badge')?.textContent, 'SCOUT \u00b7 UNKNOWN');
    }
  } finally {
    finish({ assessments: [], settings: defaults });
    overlay.stop();
    dom.window.close();
  }
});

test('fresh mint-keyed evidence replaces scanning colours, while a recycled or removed row loses its old verdict', async () => {
  const dom = pulse(`<main>
    <section><h2>New Pairs</h2><article id="green"><a href="/t/${one}?chain=sol">SAME</a></article></section>
    <section><h2>Final Stretch</h2><article id="amber"><a href="/t/${two}?chain=sol">SAME</a></article></section>
    <section><h2>Migrated</h2><article id="red"><a href="/t/${three}?chain=sol">SAME</a></article></section>
  </main>`);
  const now = Date.now();
  const [sample] = await fetchTokens('demo', now);
  const [top] = assessTokens([{ ...sample, mint: one, provider: 'Verified fixture' }], defaults, now);
  assert.equal(top.status, 'TOP CANDIDATE');
  const watch = { ...top, token: { ...top.token, mint: two }, status: 'WATCH' };
  const risk = { ...top, token: { ...top.token, mint: three }, status: 'HIGH RISK', critical: ['Freeze authority active'] };
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const overlay = createAxiomPulseOverlay({
    document: dom.window.document, request: () => pending, debounceMs: 0, intervalMs: 15_000
  });
  try {
    overlay.start();
    const [green, amber, red] = ['green', 'amber', 'red'].map(id => dom.window.document.getElementById(id));
    for (const row of [green, amber, red]) assert.equal(row.classList.contains('scout-pulse-neutral'), true);
    finish({ assessments: [top, watch, risk], settings: defaults });
    await delay(10);
    for (const [row, severity] of [[green, 'green'], [amber, 'amber'], [red, 'red']]) {
      assert.equal(row.classList.contains(`scout-pulse-${severity}`), true);
      assert.equal(row.classList.contains('scout-pulse-neutral'), false);
      assert.equal(row.classList.contains('scout-pulse-gray'), false);
      assert.equal(row.querySelector(`.scout-pulse-badge--${severity}`) !== null, true);
    }

    green.querySelector('a').setAttribute('href', `/t/${'44444444444444444444444444444444'}?chain=sol`);
    await delay(10);
    assert.equal(green.classList.contains('scout-pulse-green'), false);
    assert.equal(green.classList.contains('scout-pulse-neutral'), true);
    assert.equal(green.querySelector('.scout-pulse-badge')?.textContent, 'SCOUT \u00b7 SCANNING');

    red.remove();
    await delay(10);
    assert.equal(red.classList.contains('scout-pulse-row'), false);
    assert.equal(red.classList.contains('scout-pulse-red'), false);
    assert.equal(red.querySelector('.scout-pulse-badge'), null);
  } finally {
    finish({ assessments: [], settings: defaults });
    overlay.stop();
    dom.window.close();
  }
});

test('a newly inserted plain div coin card receives a fallback colour without a manual refresh', async () => {
  const dom = pulse(`<section><h2>New Pairs</h2><div id="cards">
    <div id="known"><img src="/known.png" alt="Known coin"><a href="/t/${one}?chain=sol">Known</a><button>⚡ 0 SOL</button></div>
    <div id="known2"><img src="/known2.png" alt="Other coin"><a href="/t/${two}?chain=sol">Other</a><button>⚡ 0 SOL</button></div>
  </div></section>`);
  const overlay = createAxiomPulseOverlay({
    document: dom.window.document,
    request: async () => ({ assessments: [], settings: defaults }),
    debounceMs: 0, intervalMs: 15_000
  });
  try {
    overlay.start();
    await delay(10);
    assert.equal(dom.window.document.getElementById('known').classList.contains('scout-pulse-gray'), true);
    assert.equal(dom.window.document.getElementById('cards').classList.contains('scout-pulse-row'), false);
    const fresh = dom.window.document.createElement('div');
    fresh.id = 'new-card';
    fresh.innerHTML = '<img src="/new.png" alt="New coin"><span>NEWCOIN</span><button>⚡ 0 SOL</button>';
    dom.window.document.getElementById('cards').append(fresh);
    await delay(10);
    assert.equal(fresh.classList.contains('scout-pulse-gray'), true);
    assert.match(fresh.querySelector('.scout-pulse-badge')?.textContent ?? '', /MINT UNKNOWN/);
    assert.equal(fresh.classList.contains('scout-pulse-green'), false);
    assert.equal(dom.window.document.getElementById('cards').classList.contains('scout-pulse-row'), false);
  } finally { overlay.stop(); dom.window.close(); }
});

test('an incomplete but fresh exact-mint assessment stays gray and explains the missing evidence', async () => {
  const dom = pulse(`<section><h2>New Pairs</h2><article id="row"><a href="/t/${one}?chain=sol">Coin</a></article></section>`);
  const now = Date.now();
  const [sample] = await fetchTokens('demo', now);
  const [top] = assessTokens([{ ...sample, mint: one, provider: 'Verified fixture' }], defaults, now);
  const incomplete = { ...top, status: 'UNKNOWN / INCOMPLETE', missing: ['Developer history unknown'] };
  const overlay = createAxiomPulseOverlay({
    document: dom.window.document,
    request: async () => ({ assessments: [incomplete], settings: defaults }),
    debounceMs: 0
  });
  try {
    overlay.start();
    await delay(10);
    const row = dom.window.document.getElementById('row');
    assert.equal(row.classList.contains('scout-pulse-gray'), true);
    assert.equal(row.classList.contains('scout-pulse-green'), false);
    assert.equal(row.querySelector('.scout-pulse-badge')?.textContent, 'SCOUT \u00b7 UNKNOWN');
    assert.match(row.querySelector('.scout-pulse-badge')?.title ?? '', /Developer history unknown/);
  } finally { overlay.stop(); dom.window.close(); }
});

test('a coin trading hard is badged for movement even when its score can say little', async () => {
  const dom = pulse(`<section><h2>New Pairs</h2><article id="row"><a href="/t/${one}?chain=sol">RUN</a></article></section>`);
  const now = Date.now();
  // A brand-new pair as the pool feed describes it: no creator, no holders, no token
  // controls, so a low score here means "not enough evidence", not "nothing happening".
  const [assessment] = assessTokens([{
    mint: one, chain: 'solana', name: 'Runner', symbol: 'RUN', stage: 'new',
    launchedAt: now - 240_000, observedAt: now,
    priceUsd: 0.001, marketCapUsd: 60_000, fdvUsd: 60_000, liquidityUsd: 20_000, liquidityChangePct: null,
    priceChange5mPct: 4, imageUrl: null, trades: [], holders: null,
    developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: '' },
    mintAuthority: null, freezeAuthority: null, transferRestriction: null, migrationProgressPct: null,
    provider: 'test fixture',
    // Balanced buy and sell counts, so the older buy-lead path cannot catch this one,
    // but the pool is turned over twice in five minutes.
    marketSnapshot: { volume5m: 40_000, volume15m: 0, buys5m: 100, sells5m: 100, buyers5m: null, sellers5m: null }
  }], defaults, now);
  assert.equal(assessment.status, 'WAIT FOR CONFIRMATION', 'the verdict genuinely cannot say much here');
  const overlay = createAxiomPulseOverlay({
    document: dom.window.document,
    request: async () => ({ assessments: [assessment], settings: defaults }),
    debounceMs: 0
  });
  try {
    overlay.start();
    await waitFor(() => dom.window.document.querySelector('.scout-pulse-badge--run'), 'the movement badge');
    const row = dom.window.document.getElementById('row');
    assert.equal(row.classList.contains('scout-pulse-gray'), false, 'silence was the whole problem');
    assert.equal(row.classList.contains('scout-pulse-green'), false, 'movement is not a quality claim');
    assert.equal(row.classList.contains('scout-pulse-amber'), false, 'and it is not a caution either');
    assert.equal(row.querySelector('.scout-pulse-badge').textContent, 'SCOUT \u00b7 RUNNING 2.0\u00d7');
  } finally { overlay.stop(); dom.window.close(); }
});

test('a resumed Pulse tab requests fresh evidence immediately and clears an old verdict', async () => {
  const dom = pulse(`<section><h2>New Pairs</h2><article id="row"><a href="/t/${one}?chain=sol">Coin</a></article></section>`);
  await delay(0); // Let jsdom finish its initial pageshow before Scout subscribes.
  const now = Date.now();
  const [sample] = await fetchTokens('demo', now);
  const [top] = assessTokens([{ ...sample, mint: one, provider: 'Verified fixture' }], defaults, now);
  let calls = 0;
  const overlay = createAxiomPulseOverlay({
    document: dom.window.document,
    request: async () => ({ assessments: ++calls === 1 ? [top] : [], settings: defaults }),
    debounceMs: 0, intervalMs: 15_000
  });
  try {
    overlay.start();
    await delay(10);
    const row = dom.window.document.getElementById('row');
    assert.equal(calls, 1);
    assert.equal(row.classList.contains('scout-pulse-green'), true);

    Object.defineProperty(dom.window.document, 'visibilityState', { configurable: true, value: 'hidden' });
    dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
    await delay(10);
    assert.equal(calls, 1);

    Object.defineProperty(dom.window.document, 'visibilityState', { configurable: true, value: 'visible' });
    dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
    await delay(10);
    assert.equal(calls, 2);
    assert.equal(row.classList.contains('scout-pulse-green'), false);
    assert.equal(row.classList.contains('scout-pulse-gray'), true);

    dom.window.dispatchEvent(new dom.window.Event('pageshow'));
    await delay(10);
    assert.equal(calls, 3);
    overlay.stop();
    dom.window.dispatchEvent(new dom.window.Event('pageshow'));
    await delay(10);
    assert.equal(calls, 3);
  } finally { overlay.stop(); dom.window.close(); }
});

test('an unattended Pulse tab scans mints beyond the first bounded batch', async () => {
  const mints = Array.from({ length: 10 }, (_, index) => '1'.repeat(31) + '123456789A'[index]);
  const cards = mints.map((mint, index) => `<article id="coin-${index}"><a href="/t/${mint}?chain=sol">Coin ${index}</a></article>`).join('');
  const dom = pulse(`<section><h2>New Pairs</h2>${cards}</section>`);
  const calls = [];
  const overlay = createAxiomPulseOverlay({
    document: dom.window.document,
    request: async batch => { calls.push(batch); return { assessments: [], settings: defaults }; },
    debounceMs: 0, intervalMs: 100, batchSize: 8
  });
  try {
    overlay.start();
    const deadline = Date.now() + 600;
    while (calls.length < 2 && Date.now() < deadline) await delay(10);
    assert.equal(calls.length >= 2, true, 'the heartbeat scans a second batch without the popup');
    assert.equal(calls[0].length, 8);
    assert.equal(calls[1].length, 2);
    assert.deepEqual(new Set([...calls[0], ...calls[1]]), new Set(mints));
    for (let index = 0; index < mints.length; index++) {
      const row = dom.window.document.getElementById(`coin-${index}`);
      assert.equal(row.classList.contains('scout-pulse-gray'), true, `coin ${index} remains visibly classified`);
    }
  } finally { overlay.stop(); dom.window.close(); }
});
