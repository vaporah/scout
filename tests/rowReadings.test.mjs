import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { hasReadings, readRowReadings, rowMint } from '../dist/src/rowReadings.js';

const mint = '11111111111111111111111111111111';

function card(html) {
  const dom = new JSDOM(`<div id="row">${html}</div>`, { url: 'https://axiom.trade/pulse' });
  return { dom, row: dom.window.document.getElementById('row') };
}

test('a Pulse card is read for the live facts it prints about itself', () => {
  const { dom, row } = card('<img alt="FINCH"><span>$0.0000123</span><span>-4.2%</span><span>3m</span><span>MC: $48.2K</span><span>Liq: $9.1K</span><span>Vol: $21K</span><span>12 / 7</span>');
  try {
    const readings = readRowReadings(row);
    assert.deepEqual(readings, {
      symbol: 'FINCH',
      price: '$0.0000123',
      change: '-4.2%',
      age: '3m',
      marketCap: '$48.2K',
      liquidity: '$9.1K',
      volume: '$21K',
      trades: '12 / 7'
    });
    assert.equal(hasReadings(readings), true);
  } finally { dom.window.close(); }
});

test('nothing is invented when the card prints no numbers', () => {
  const { dom, row } = card('<img alt="New"><a href="/t/x">Buy</a>');
  try {
    const readings = readRowReadings(row);
    assert.equal(readings.price, null);
    assert.equal(readings.change, null);
    assert.equal(readings.marketCap, null);
    assert.equal(readings.liquidity, null);
    assert.equal(readings.volume, null);
    assert.equal(readings.trades, null);
    assert.equal(hasReadings(readings), false);
  } finally { dom.window.close(); }
});

test('an unchanged card keeps the same reading on every pass', () => {
  const { dom, row } = card('<img alt="FINCH"><span>$1.5K</span><span>+2%</span>');
  try {
    const first = readRowReadings(row);
    row.querySelector('span').textContent = '$2.5K';
    const second = readRowReadings(row);
    assert.equal(first.price, '$1.5K');
    assert.equal(second.price, '$2.5K', 'readings follow the live card');
  } finally { dom.window.close(); }
});

test('a row exposes exactly one mint from its own attributes', () => {
  const { dom, row } = card(`<span>FINCH</span><span data-address="${mint}"></span>`);
  try {
    assert.equal(rowMint(row), mint);
  } finally { dom.window.close(); }
});

test("Scout's own badge is never reported as a fact about the coin", () => {
  const { dom, row } = card('<span>$1.2K</span><span>+8%</span><span class="scout-pulse-badge" title="Scout">SCOUT 96 \u00b7 TOP \u00b7 $99M</span>');
  try {
    const readings = readRowReadings(row);
    assert.equal(readings.price, '$1.2K');
    assert.equal(readings.change, '+8%');
  } finally { dom.window.close(); }
});
