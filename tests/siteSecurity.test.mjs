import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const siteFile = name => new URL(`../site/${name}`, import.meta.url);

test('the public site keeps a locked-down browser security policy', async () => {
  const headers = await readFile(siteFile('_headers'), 'utf8');

  assert.match(headers, /Content-Security-Policy: default-src 'none'/);
  assert.match(headers, /script-src 'self'/);
  assert.match(headers, /connect-src https:\/\/api\.geckoterminal\.com/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /Cross-Origin-Opener-Policy: same-origin/);
  assert.match(headers, /Cross-Origin-Resource-Policy: same-origin/);
  assert.match(headers, /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\), usb=\(\)/);
});

test('the landing page makes the product and its safety boundaries explicit', async () => {
  const html = await readFile(siteFile('index.html'), 'utf8');

  assert.match(html, /scout-research-overlay\.jpg/);
  assert.match(html, /No wallet access\./);
  assert.match(html, /No seed phrase, private key, wallet connection/);
  assert.match(html, /Illustrative product view with fictional tokens and data/);
});

test('supported-platform links use the official HTTPS entry points safely', async () => {
  const html = await readFile(siteFile('index.html'), 'utf8');
  const dom = new JSDOM(html);
  const links = [...dom.window.document.querySelectorAll('.platform-link')];

  assert.deepEqual(links.map(link => link.href), ['https://axiom.trade/', 'https://gmgn.ai/']);
  for (const link of links) {
    assert.equal(link.target, '_blank');
    assert.match(link.rel, /noopener/);
    assert.match(link.rel, /noreferrer/);
  }
  assert.equal(dom.window.document.querySelector('.platform-mark--axiom img').getAttribute('src'), '/axiom-logo.ico');
  dom.window.close();
});

test('the live market preview is keyboard-accessible and updates from validated market data', async () => {
  const html = await readFile(siteFile('index.html'), 'utf8');
  const script = await readFile(siteFile('site.js'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://scoutai.trade/', runScripts: 'outside-only' });
  dom.window.matchMedia = () => ({ matches: true, addEventListener() {} });
  dom.window.AbortController = AbortController;
  dom.window.setInterval = () => 0;
  dom.window.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: [
        { attributes: { name: 'First Coin / SOL', base_token_price_usd: '1.25', market_cap_usd: '1200000', price_change_percentage: { h1: '4.5' }, volume_usd: { h1: '125000' } }, relationships: { base_token: { data: { id: 'solana_first' } } } },
        { attributes: { name: 'Second Coin / SOL', base_token_price_usd: '2.5', market_cap_usd: '2500000', price_change_percentage: { h1: '-3.2' }, volume_usd: { h1: '250000' } }, relationships: { base_token: { data: { id: 'solana_second' } } } },
        { attributes: { name: 'Third Coin / SOL', base_token_price_usd: '0.005', market_cap_usd: '500000', price_change_percentage: { h1: '1.1' }, volume_usd: { h1: '50000' } }, relationships: { base_token: { data: { id: 'solana_third' } } } }
      ],
      included: [
        { type: 'token', id: 'solana_first', attributes: { name: 'First Coin', symbol: 'one' } },
        { type: 'token', id: 'solana_second', attributes: { name: 'Second Coin', symbol: 'two' } },
        { type: 'token', id: 'solana_third', attributes: { name: 'Third Coin', symbol: 'three' } }
      ]
    })
  });
  dom.window.eval(script);
  await new Promise(resolve => setTimeout(resolve, 0));

  const third = dom.window.document.querySelector('[data-live-row="2"]');
  assert.equal(third.tagName, 'BUTTON');
  third.click();
  assert.equal(third.getAttribute('aria-pressed'), 'true');
  assert.equal(dom.window.document.getElementById('demo-heading').textContent, 'THREE trending context.');
  assert.match(dom.window.document.getElementById('demo-note').textContent, /not a trading signal/);
  dom.window.close();
});
