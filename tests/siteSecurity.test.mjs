import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';

const siteFile = name => new URL(`../site/${name}`, import.meta.url);

test('the public release config names the package version', async () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const config = await readFile(siteFile('release-config.js'), 'utf8');
  assert.match(config, new RegExp(`version: '${pkg.version.replaceAll('.', '\\.')}'`));
});

test('every cacheable site asset URL carries its current content hash', async () => {
  for (const page of ['index.html', 'privacy/index.html', '404.html']) {
    const html = await readFile(siteFile(page), 'utf8');
    const dom = new JSDOM(html);
    const assets = [...dom.window.document.querySelectorAll('link[href*="?v="], script[src], img[src*="?v="]')]
      .filter(element => new URL(element.getAttribute('href') || element.getAttribute('src'), 'https://scoutai.trade/').origin === 'https://scoutai.trade');
    for (const element of assets) {
      const reference = element.getAttribute('href') || element.getAttribute('src');
      const url = new URL(reference, 'https://scoutai.trade/');
      const source = await readFile(siteFile(url.pathname.slice(1)));
      const expected = createHash('sha256').update(source).digest('hex').slice(0, 10);
      assert.equal(url.searchParams.get('v'), expected, `${page} has a stale cache key for ${url.pathname}`);
    }
    dom.window.close();
  }
});

test('the public site keeps a locked-down browser security policy', async () => {
  const headers = await readFile(siteFile('_headers'), 'utf8');

  assert.match(headers, /Content-Security-Policy: default-src 'none'/);
  assert.match(headers, /script-src 'self' https:\/\/www\.googletagmanager\.com/);
  assert.match(headers, /connect-src 'self' https:\/\/api\.geckoterminal\.com https:\/\/www\.google-analytics\.com https:\/\/region1\.google-analytics\.com/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /Cross-Origin-Opener-Policy: same-origin/);
  assert.match(headers, /Cross-Origin-Resource-Policy: same-origin/);
  assert.match(headers, /Permissions-Policy: camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\), usb=\(\)/);
});

test('every public page loads the configured Google tag without inline script', async () => {
  for (const page of ['index.html', 'privacy/index.html', '404.html']) {
    const html = await readFile(siteFile(page), 'utf8');
    const dom = new JSDOM(html);
    assert.equal(dom.window.document.querySelector('script[src="https://www.googletagmanager.com/gtag/js?id=G-GJPRNYRR0P"]')?.hasAttribute('async'), true);
    assert.ok(dom.window.document.querySelector('script[src^="/analytics.js?v="]'));
    // Structured data is inert JSON, not executable inline JavaScript. Keep the
    // CSP guard focused on inline scripts the browser could actually execute.
    assert.equal([...dom.window.document.scripts].some(script =>
      !script.src && script.type !== 'application/ld+json' && script.textContent.trim()), false);
    dom.window.close();
  }
  assert.match(await readFile(siteFile('analytics.js'), 'utf8'), /gtag\('config', 'G-GJPRNYRR0P'\)/);
});

test('the deployment marker represents the complete interactive asset set', async () => {
  const names = ['styles.css', 'home.css', 'theme.js', 'release-config.js', 'site.js', 'analytics.js', 'scout-research-overlay.jpg', 'icon-32.png', 'icon-128.png', 'padre-logo.svg'];
  const digest = createHash('sha256');
  for (const name of names) digest.update(await readFile(siteFile(name)));
  const expected = digest.digest('hex').slice(0, 10);
  const html = await readFile(siteFile('index.html'), 'utf8');
  const dom = new JSDOM(html);
  const marker = JSON.parse(await readFile(siteFile('build.json'), 'utf8')).build;

  assert.equal(dom.window.document.querySelector('meta[name="scout-build"]')?.content, expected);
  assert.equal(marker, expected);
  dom.window.close();
});

test('motion stays enabled regardless of an origin-specific reduced-motion flag', async () => {
  const html = await readFile(siteFile('index.html'), 'utf8');
  const script = await readFile(siteFile('theme.js'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://scoutai.trade/', runScripts: 'outside-only' });
  dom.window.matchMedia = query => ({ matches: query.includes('prefers-reduced-motion: reduce'), addEventListener() {} });
  dom.window.eval(script);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));

  const root = dom.window.document.documentElement;
  assert.equal(root.classList.contains('motion-full'), true);
  assert.equal(root.classList.contains('motion-reduce'), false);
  assert.equal(dom.window.document.getElementById('motion-toggle'), null);
  dom.window.close();
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

  assert.deepEqual(links.map(link => link.href), ['https://axiom.trade/', 'https://gmgn.ai/', 'https://trade.padre.gg/']);
  for (const link of links) {
    assert.equal(link.target, '_blank');
    assert.match(link.rel, /noopener/);
    assert.match(link.rel, /noreferrer/);
  }
  assert.equal(dom.window.document.querySelector('.platform-mark--axiom img').getAttribute('src'), '/axiom-logo.ico');
  assert.equal(dom.window.document.querySelector('.platform-mark--padre img').getAttribute('src'), '/padre-logo.svg');
  dom.window.close();
});

test('the live market preview is keyboard-accessible and updates from validated market data', async () => {
  const html = await readFile(siteFile('index.html'), 'utf8');
  const script = await readFile(siteFile('site.js'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://scoutai.trade/', runScripts: 'outside-only' });
  dom.window.matchMedia = () => ({ matches: true, addEventListener() {} });
  dom.window.AbortController = AbortController;
  dom.window.setInterval = () => 0;
  let copied;
  Object.defineProperty(dom.window.navigator, 'clipboard', { value: { async writeText(value) { copied = value; } } });
  dom.window.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: [
        { attributes: { name: 'First Coin / SOL', base_token_price_usd: '1.25', market_cap_usd: '1200000', price_change_percentage: { h1: '4.5' }, volume_usd: { h1: '125000' } }, relationships: { base_token: { data: { id: 'solana_first' } } } },
        { attributes: { name: 'Second Coin / SOL', base_token_price_usd: '2.5', market_cap_usd: '2500000', price_change_percentage: { h1: '-3.2' }, volume_usd: { h1: '250000' } }, relationships: { base_token: { data: { id: 'solana_second' } } } },
        { attributes: { name: 'Third Coin / SOL', base_token_price_usd: '0.005', market_cap_usd: '500000', price_change_percentage: { h1: '1.1' }, volume_usd: { h1: '50000' } }, relationships: { base_token: { data: { id: 'solana_third' } } } }
      ],
      included: [
        { type: 'token', id: 'solana_first', attributes: { name: 'First Coin', symbol: 'one', address: 'FirstMint111111111111111111111111111111111' } },
        { type: 'token', id: 'solana_second', attributes: { name: 'Second Coin', symbol: 'two', address: 'SecondMint2222222222222222222222222222222' } },
        { type: 'token', id: 'solana_third', attributes: { name: 'Third Coin', symbol: 'three', address: 'ThirdMint33333333333333333333333333333333' } }
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
  const contract = dom.window.document.getElementById('demo-contract');
  assert.equal(contract.tagName, 'BUTTON');
  contract.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(copied, 'ThirdMint33333333333333333333333333333333');
  assert.equal(contract.textContent, 'Copied');
  dom.window.close();
});
