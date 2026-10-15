import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { fetchTokens } from '../dist/src/provider.js';
import { assessTokens } from '../dist/src/analysis.js';
import { defaults } from '../dist/src/settings.js';
import { applyPulseSignals, hotClass } from '../dist/src/pulseRows.js';

test('Pulse row colour follows the exact mint and clears when a recycled row changes mint', async () => {
  const dom = new JSDOM('<div id="row"></div>');
  try {
    const now = Date.now();
    const [sample] = await fetchTokens('demo', now);
    const mint = '11111111111111111111111111111111';
    const other = '22222222222222222222222222222222';
    const token = { ...sample, mint, provider: 'Verified fixture' };
    const [assessment] = assessTokens([token], defaults, now);
    assert.equal(assessment.status, 'TOP CANDIDATE');
    const row = dom.window.document.querySelector('#row');

    assert.equal(applyPulseSignals([{ element: row, mint: other }], [assessment], defaults, now), 0);
    assert.equal(row.classList.contains('scout-pulse-green'), false);
    assert.equal(applyPulseSignals([{ element: row, mint }], [assessment], defaults, now), 1);
    assert.equal(row.classList.contains('scout-pulse-green'), true);
    assert.equal(row.dataset.scoutMint, mint);

    applyPulseSignals([{ element: row, mint: other }], [assessment], defaults, now);
    assert.equal(row.classList.contains('scout-pulse-green'), false);
    assert.equal(row.dataset.scoutMint, undefined);
  } finally { dom.window.close(); }
});

test('Pulse renderer never keeps stale, demo, or critical-risk green assessments', async () => {
  const dom = new JSDOM('<div id="row"></div>');
  try {
    const now = Date.now();
    const [sample] = await fetchTokens('demo', now);
    const mint = '11111111111111111111111111111111';
    const token = { ...sample, mint, provider: 'Verified fixture' };
    const [top] = assessTokens([token], defaults, now);
    const row = dom.window.document.querySelector('#row');
    const target = [{ element: row, mint }];

    applyPulseSignals(target, [top], defaults, now);
    assert.equal(row.classList.contains('scout-pulse-green'), true);
    assert.equal(applyPulseSignals(target, [top], defaults, top.expiresAt + 1), 0);
    assert.equal(row.classList.contains('scout-pulse-green'), false);

    const [unsafe] = assessTokens([{ ...token, freezeAuthority: true }], defaults, now);
    assert.equal(applyPulseSignals(target, [unsafe], defaults, now), 1);
    assert.equal(row.classList.contains('scout-pulse-red'), true);
    assert.equal(row.classList.contains('scout-pulse-green'), false);

    applyPulseSignals(target, [{ ...top, token: { ...top.token, provider: 'SIMULATED DEMO' } }], defaults, now);
    assert.equal(row.classList.contains('scout-pulse-green'), false);
    assert.equal(row.classList.contains('scout-pulse-red'), false);
  } finally { dom.window.close(); }
});

test('the bright animated highlight is added for a hot coin and removed when it cools', async () => {
  const dom = new JSDOM('<div id="row"></div>');
  try {
    const now = Date.now();
    const [sample] = await fetchTokens('demo', now);
    const mint = '11111111111111111111111111111111';
    const token = { ...sample, mint, provider: 'Verified fixture' };
    const [top] = assessTokens([token], defaults, now);
    assert.equal(top.status, 'TOP CANDIDATE');
    const row = dom.window.document.querySelector('#row');
    const target = [{ element: row, mint }];

    applyPulseSignals(target, [top], defaults, now);
    assert.equal(row.classList.contains(hotClass), true, 'a strong coin with broad buying and heavy volume is highlighted');
    assert.match(row.dataset.scoutHot ?? '', /^\d+ unique buyers, \d+ buys/);
    assert.match(row.dataset.scoutHot ?? '', /of liquidity$/, 'the reason records the turnover that earned it');
    // The verdict colour is untouched: hot is additive, not a colour of its own.
    assert.equal(row.classList.contains('scout-pulse-green'), true);
    assert.equal(row.dataset.scoutMint, mint);

    // Quiet volume is the fastest way to lose the brightest highlight.
    applyPulseSignals(target, [{ ...top, analytics: { ...top.analytics, volume5m: 1 } }], defaults, now);
    assert.equal(row.classList.contains(hotClass), false);
    assert.equal(row.dataset.scoutHot, undefined, 'the reason goes with the highlight');

    // Enough buys, but too few distinct wallets, is not a crowd.
    applyPulseSignals(target, [{ ...top, analytics: { ...top.analytics, buyers5m: 3, buys5m: 60, sells5m: 4 } }], defaults, now);
    assert.equal(row.classList.contains(hotClass), false);

    // A WATCH coin can be hot too, and then the halo follows its own amber tone.
    applyPulseSignals(target, [{ ...top, status: 'WATCH' }], defaults, now);
    assert.equal(row.classList.contains('scout-pulse-amber'), true);
    assert.equal(row.classList.contains(hotClass), true, 'the tier Scout can actually reach on a live new pair still qualifies');

    // A row that no longer matches the mint cannot keep a stale highlight.
    applyPulseSignals(target, [top], defaults, now);
    assert.equal(row.classList.contains(hotClass), true);
    applyPulseSignals([{ element: row, mint: '22222222222222222222222222222222' }], [top], defaults, now);
    assert.equal(row.classList.contains(hotClass), false);
    assert.equal(row.dataset.scoutHot, undefined);
  } finally { dom.window.close(); }
});
