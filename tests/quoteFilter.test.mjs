import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { assessTokens } from '../dist/src/analysis.js';
import { fetchTokens } from '../dist/src/provider.js';
import { defaults } from '../dist/src/settings.js';
import {
  filterByQuote, loadQuoteFilter, matchesQuote, quoteOf, quoteOptions, saveQuoteFilter, toggleQuote
} from '../dist/src/quoteFilter.js';

const base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function mintAt(index) {
  let value = index + 1;
  let text = '';
  while (text.length < 32) {
    text = base58[value % base58.length] + text;
    value = Math.floor(value / base58.length) + 3;
  }
  return text;
}

/** Build assessments whose pool quote assets are the symbols given. */
async function sample(quoteSymbols) {
  const now = Date.now();
  const [base] = await fetchTokens('demo', now);
  const tokens = quoteSymbols.map((quoteSymbol, index) => ({ ...base, mint: mintAt(index), quoteSymbol, provider: 'Verified fixture' }));
  return assessTokens(tokens, defaults, now);
}

test('a pool is bucketed by the quote asset the feed reported', async () => {
  const [sol, wrapped, usdc, usdt, usd1, other, missing] = await sample(['SOL', 'wsol', 'USDC', 'usdt', 'USD1', 'BONK', null]);
  assert.equal(quoteOf(sol), 'sol');
  assert.equal(quoteOf(wrapped), 'sol', 'wrapped SOL is still SOL');
  assert.equal(quoteOf(usdc), 'usdc');
  assert.equal(quoteOf(usdt), 'usdt', 'the symbol comparison is case-insensitive');
  assert.equal(quoteOf(usd1), 'usd1');
  assert.equal(quoteOf(other), 'other', 'an unrecognised quote asset is not guessed at');
  assert.equal(quoteOf(missing), 'other', 'a pool with no reported quote asset lands in other');
});

test('every bucket is always offered, in a fixed order, with its count', async () => {
  const assessments = await sample(['SOL', 'SOL', 'USDC', null]);
  const options = quoteOptions(assessments);
  assert.deepEqual(options.map(option => option.id), ['sol', 'usdc', 'usdt', 'usd1', 'other']);
  assert.deepEqual(options.map(option => option.count), [2, 1, 0, 0, 1]);
  assert.ok(options.every(option => /<(?:svg|img)\b/.test(option.mark)), 'every bucket carries a mark');
  assert.ok(options.every(option => /^#[0-9a-f]{6}$/i.test(option.color)), 'every bucket carries a colour');
});

test('an empty selection means every quote asset, a selection means only those', async () => {
  const assessments = await sample(['SOL', 'USDC', 'USD1', 'BONK']);
  assert.equal(filterByQuote(assessments, []).length, 4);
  assert.equal(filterByQuote(assessments, ['scout:none']).length, 0);
  assert.deepEqual(filterByQuote(assessments, ['usdc']).map(quoteOf), ['usdc']);
  assert.deepEqual(filterByQuote(assessments, ['sol', 'other']).map(quoteOf), ['sol', 'other']);
  assert.equal(matchesQuote(assessments[0], []), true);
  assert.equal(matchesQuote(assessments[0], ['usdc']), false);
});

test('the quote selection is validated, remembered and toggled', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scout.test/' });
  const original = globalThis.localStorage;
  globalThis.localStorage = dom.window.localStorage;
  try {
    assert.deepEqual(loadQuoteFilter(), [], 'nothing selected by default');
    saveQuoteFilter(['sol', 'usdc', 'sol']);
    assert.deepEqual(loadQuoteFilter(), ['sol', 'usdc'], 'duplicates are dropped');

    dom.window.localStorage.setItem('scout.quotes.v1', JSON.stringify(['sol', 'bad id', 7, '<script>']));
    assert.deepEqual(loadQuoteFilter(), ['sol'], 'junk ids are dropped');
    dom.window.localStorage.setItem('scout.quotes.v1', '{not json');
    assert.deepEqual(loadQuoteFilter(), [], 'unreadable storage falls back to no filter');

    assert.deepEqual(toggleQuote(['sol'], 'usdc'), ['sol', 'usdc']);
    assert.deepEqual(toggleQuote(['sol', 'usdc'], 'sol'), ['usdc']);

    // The launchpad and quote filters keep wholly separate selections.
    dom.window.localStorage.setItem('scout.platforms.v1', JSON.stringify(['pumpfun']));
    saveQuoteFilter(['sol']);
    assert.deepEqual(loadQuoteFilter(), ['sol']);
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem('scout.platforms.v1')), ['pumpfun']);
  } finally {
    globalThis.localStorage = original;
    dom.window.close();
  }
});
