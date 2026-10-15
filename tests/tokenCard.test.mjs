import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { assessTokens } from '../dist/src/analysis.js';
import { fetchTokens } from '../dist/src/provider.js';
import { defaults } from '../dist/src/settings.js';
import { safeImageUrl } from '../dist/src/ui.js';
import { avatarStyle, coinHue, popupCoinRow, statChips, tokenCard } from '../dist/src/tokenCard.js';

const mint = '11111111111111111111111111111111';
const other = '22222222222222222222222222222222';

async function example(overrides = {}) {
  const now = Date.now();
  const [sample] = await fetchTokens('demo', now);
  return assessTokens([{ ...sample, mint, provider: 'Verified fixture', ...overrides }], defaults, now)[0];
}

function chips(html) {
  const dom = new JSDOM(`<div id="row">${html}</div>`);
  return {
    dom,
    labels: [...dom.window.document.querySelectorAll('.stat-chip small')].map(node => node.textContent),
    values: [...dom.window.document.querySelectorAll('.stat-chip b')].map(node => node.textContent)
  };
}

test('a coin row shows the live chips it has and never a placeholder', async () => {
  const a = await example();
  const { dom, labels, values } = chips(popupCoinRow(a, { settings: defaults, mode: 'demo' }));
  try {
    assert.equal(labels[0], 'Dev', 'the developer verdict always leads the row');
    assert.ok(labels.includes('5m'));
    assert.ok(labels.includes('Top 10'));
    assert.equal(values.includes('Unknown'), false);
    assert.equal(dom.window.document.querySelectorAll('.stat-chip').length, 4, 'the popup keeps rows compact');
    assert.equal(new Set(labels).size, labels.length, 'no chip is repeated');
  } finally { dom.window.close(); }
});

test('chip tone follows the sign of the observation', async () => {
  const up = await example({ priceChange5mPct: 12.5, liquidityChangePct: 4 });
  const down = await example({ priceChange5mPct: -9.5, liquidityChangePct: -3 });
  assert.equal(statChips(up, 'live').find(chip => chip.label === '5m')?.tone, 'up');
  assert.equal(statChips(down, 'live').find(chip => chip.label === '5m')?.tone, 'down');
  assert.equal(statChips(down, 'live').find(chip => chip.label === 'Liq chg')?.tone, 'down');
});

test('an unknown fact is omitted rather than shown as zero', async () => {
  const a = await example({ marketCapUsd: null, liquidityUsd: null });
  const labels = statChips(a, 'demo').map(chip => chip.label);
  assert.equal(labels.includes('MC'), false);
  assert.equal(labels.includes('Liq'), false);
  assert.equal(labels.includes('Turnover'), false, 'turnover needs liquidity to be meaningful');
});

test('untrusted token text is escaped in both coin layouts', async () => {
  const a = await example({ name: '<img src=x onerror=alert(1)>', symbol: '<b>BAD</b>' });
  const dom = new JSDOM(`<div id="wrap">${tokenCard(a, { settings: defaults, mode: 'demo' })}</div>`);
  try {
    const card = dom.window.document.querySelector('.token-card');
    assert.ok(card);
    assert.equal(dom.window.document.querySelector('img, script'), null);
    assert.match(card.textContent ?? '', /<img src=x onerror=alert\(1\)>/);
    assert.equal(card.dataset.mint, mint);
  } finally { dom.window.close(); }
});

test('the dashboard card marks the pinned and selected coin and keeps its data-mint', async () => {
  const a = await example();
  const dom = new JSDOM(`<div>${tokenCard(a, { settings: defaults, mode: 'live', pinned: true, active: true })}</div>`);
  try {
    const card = dom.window.document.querySelector('.token-card');
    assert.equal(card.classList.contains('active'), true);
    assert.equal(card.querySelector('.pinned-label')?.textContent, 'PINNED');
    assert.equal(card.querySelector('.token-right strong')?.textContent?.startsWith(String(a.score)), true);
    const metas = [...card.querySelectorAll('.meta-chip')].map(node => node.textContent ?? '');
    assert.ok(metas.some(text => /DEV$/.test(text)), `the developer verdict is on the card: ${metas.join(' | ')}`);
    assert.ok(metas.some(text => /m old/.test(text)), 'the pool age is still shown');
  } finally { dom.window.close(); }
});

test('each coin keeps its own stable avatar tint', () => {
  assert.equal(coinHue(mint), coinHue(mint));
  assert.notEqual(coinHue(mint), coinHue(other));
  assert.match(avatarStyle(mint), /^--coin-hue:\d+$/);
  const hue = Number.parseInt(avatarStyle(mint).split(':')[1] ?? '', 10);
  assert.ok(hue >= 0 && hue < 360, 'the tint stays inside the colour wheel');
});

test('the published coin logo is shown over the tinted fallback', async () => {
  const logo = 'https://assets.coingecko.com/coins/images/1/large/coin.png?1696501400';
  const withLogo = await example({ imageUrl: logo });
  const withoutLogo = await example({ imageUrl: null });
  const dom = new JSDOM(`<div>${popupCoinRow(withLogo, { settings: defaults, mode: 'live' })}${popupCoinRow(withoutLogo, { settings: defaults, mode: 'live' })}</div>`);
  try {
    const images = dom.window.document.querySelectorAll('img.coin-img');
    assert.equal(images.length, 1, 'only the coin with a logo renders an image');
    assert.equal(images[0].getAttribute('src'), logo);
    assert.equal(images[0].getAttribute('referrerpolicy'), 'no-referrer');
    assert.equal(images[0].getAttribute('loading'), null, 'the logo loads eagerly so a background tab still shows it');
    assert.equal(images[0].getAttribute('alt'), '', 'the logo is decorative next to the ticker');
    const avatars = dom.window.document.querySelectorAll('.coin');
    assert.equal(avatars.length, 2, 'both coins keep a tinted avatar');
  } finally { dom.window.close(); }
});

test('a logo URL is only accepted when it is a plain https image URL', () => {
  assert.equal(safeImageUrl('https://cdn.example.com/a/b.png'), 'https://cdn.example.com/a/b.png');
  assert.equal(safeImageUrl('https://ipfs.io/ipfs/QmAbc123'), 'https://ipfs.io/ipfs/QmAbc123');
  assert.equal(safeImageUrl('http://cdn.example.com/a.png'), null, 'http is not accepted');
  assert.equal(safeImageUrl('javascript:alert(1)'), null);
  assert.equal(safeImageUrl('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(safeImageUrl('https://user:pass@cdn.example.com/a.png'), null, 'embedded credentials are rejected');
  assert.equal(safeImageUrl('https://localhost/a.png'), null, 'a hostname without a dot is rejected');
  assert.equal(safeImageUrl(`https://cdn.example.com/${'a'.repeat(400)}.png`), null, 'an implausible length is rejected');
  assert.equal(safeImageUrl(null), null);
  assert.equal(safeImageUrl(42), null);
});

test('every coin layout offers a copy-contract-address control that never selects the card', async () => {
  const a = await example();
  const dom = new JSDOM(`<div>${popupCoinRow(a, { settings: defaults, mode: 'live' })}${tokenCard(a, { settings: defaults, mode: 'live' })}</div>`);
  try {
    const buttons = dom.window.document.querySelectorAll('button.copy-ca');
    assert.equal(buttons.length, 2, 'the row and the card both offer a copy control');
    for (const button of buttons) {
      assert.equal(button.dataset.copyMint, mint);
      assert.equal(button.getAttribute('title'), 'Copy contract address');
      assert.equal(button.parentElement?.closest('button') ?? null, null, 'a button is never nested inside another button');
    }
    const card = dom.window.document.querySelector('.token-card');
    assert.equal(card.tagName, 'DIV');
    assert.equal(card.getAttribute('role'), 'button');
    assert.equal(card.getAttribute('tabindex'), '0');
    assert.ok(card.querySelector('.pinned-label') === null);
  } finally { dom.window.close(); }
});
