import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { resetProviderCache } from '../dist/src/provider.js';

test('the copy-address control writes the mint and reports success in place', async () => {
  const dom = setup('<div id="app"></div>');
  const restoreFetch = mockLiveFetch();
  const written = [];
  Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async text => { written.push(text); } }, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
  try {
    await import('../dist/src/popup.js?copy-test');
    await settle();
    const button = document.querySelector('.coin-row button.copy-ca');
    assert.ok(button, 'the row offers a copy control');
    const mint = button.dataset.copyMint;
    button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    await settle();
    assert.deepEqual(written, [mint]);
    assert.equal(button.textContent, '✓ copied');
    assert.equal(button.classList.contains('is-copied'), true);
    assert.equal(document.querySelectorAll('.popup-detail').length, 0, 'copying does not open the coin card');
  } finally {
    Reflect.deleteProperty(globalThis, 'navigator');
    restoreFetch();
    dom.window.close();
  }
});

test('a broken coin logo is dropped so the tinted initial stays visible', async () => {
  const { bindCoinImages } = await import('../dist/src/ui.js');
  const dom = new JSDOM('<div><span class="coin" style="--coin-hue:190">Y<img class="coin-img" src="https://cdn.example.com/logo.png"></span></div>');
  try {
    const document_ = dom.window.document;
    const image = document_.querySelector('img.coin-img');
    bindCoinImages(document_);
    image.dispatchEvent(new dom.window.Event('error'));
    assert.equal(document_.querySelector('img.coin-img'), null);
    assert.equal(document_.querySelector('.coin').textContent, 'Y');
  } finally { dom.window.close(); }
});

function setup(html) {
  const dom = new JSDOM(html, { url: 'https://scout.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  localStorage.setItem('scout.provider.v1', 'demo');
  // Each test starts from an empty provider cache so a mocked feed is really fetched.
  resetProviderCache();
  return dom;
}

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 15));
}

const liveMint = '11111111111111111111111111111111';
const livePool = '22222222222222222222222222222222';
const pumpMint = '33333333333333333333333333333333';
const solQuoteId = 'solana_So11111111111111111111111111111111111111112';
const usdcQuoteId = 'solana_UsdcQuote11111111111111111111111111111111';
/**
 * Two pools on two different launchpads, quoted in two different assets, so both
 * filters have something real to separate.
 */
function mockTwoLaunchpadsFetch() {
  const original = globalThis.fetch;
  const now = Date.now();
  const coins = [
    { mint: liveMint, pool: livePool, dex: 'raydium', symbol: 'RAYX', name: 'Ray Coin', quote: solQuoteId },
    { mint: pumpMint, pool: '44444444444444444444444444444444', dex: 'pumpfun', symbol: 'PUMPX', name: 'Pump Coin', quote: usdcQuoteId }
  ];
  const quotes = [
    { id: solQuoteId, mint: 'So11111111111111111111111111111111111111112', name: 'Wrapped SOL', symbol: 'SOL' },
    { id: usdcQuoteId, mint: 'UsdcQuote11111111111111111111111111111111', name: 'USD Coin', symbol: 'USDC' }
  ];
  const payload = {
    data: coins.map(coin => ({ attributes: { address: coin.pool, pool_created_at: new Date(now - 60_000).toISOString(), base_token_price_usd: '0.001', reserve_in_usd: '30000', price_change_percentage: { m5: '10' }, transactions: { m5: { buys: 20, sells: 5, buyers: 12, sellers: 4 } }, volume_usd: { m5: '5000', m15: '8000' } }, relationships: { base_token: { data: { id: `solana_${coin.mint}` } }, dex: { data: { id: coin.dex } }, quote_token: { data: { id: coin.quote } } } })),
    included: [
      ...coins.map(coin => ({ id: `solana_${coin.mint}`, attributes: { address: coin.mint, name: coin.name, symbol: coin.symbol } })),
      ...quotes.map(quote => ({ id: quote.id, attributes: { address: quote.mint, name: quote.name, symbol: quote.symbol } }))
    ]
  };
  globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('gopluslabs') ? { code: 1, result: {} } : payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  return () => { globalThis.fetch = original; };
}
function mockLiveFetch() {
  const original = globalThis.fetch;
  const now = Date.now();
  const payload = { data: [{ attributes: { address: livePool, pool_created_at: new Date(now - 60_000).toISOString(), base_token_price_usd: '0.001', reserve_in_usd: '30000', price_change_percentage: { m5: '10' }, transactions: { m5: { buys: 20, sells: 5, buyers: 12, sellers: 4 } }, volume_usd: { m5: '5000', m15: '8000' } }, relationships: { base_token: { data: { id: `solana_${liveMint}` } } } }], included: [{ id: `solana_${liveMint}`, attributes: { address: liveMint, name: '<img src=x onerror=alert(1)>', symbol: 'LIVE' } }] };
  globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('gopluslabs') ? { code: 1, result: {} } : payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  return () => { globalThis.fetch = original; };
}

test('dashboard opens live and stage, search, and settings controls work', async () => {
  const dom = setup('<div id="app"></div>');
  const restoreFetch = mockLiveFetch();
  try {
    await import('../dist/src/dashboard.js');
    await settle();
    assert.equal(document.querySelectorAll('[data-mint]').length, 1);
    assert.match(document.body.textContent, /Research dashboard/);
    assert.equal(document.querySelector('#provider-mode'), null);
    assert.ok(document.querySelector('.topbar > .mark img'));
    assert.equal(document.querySelector('.topbar > *').classList.contains('mark'), true);
    assert.equal(localStorage.getItem('scout.provider.v1'), null);
    assert.match(document.body.textContent, /Supporting evidence/);

    const stage = document.querySelector('#stage');
    stage.value = 'new';
    stage.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(document.querySelectorAll('[data-mint]').length, 1);

    const search = document.querySelector('#search');
    search.value = 'live';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(document.querySelectorAll('[data-mint]').length, 1);
    assert.match(document.querySelector('.detail-panel').textContent, /LIVE/);

    const liquidity = document.querySelector('[data-setting="minLiquidityUsd"]');
    liquidity.value = '50000';
    liquidity.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
    assert.equal(JSON.parse(localStorage.getItem('scout.settings.v1')).minLiquidityUsd, 50000);
    assert.match(document.querySelector('.detail-panel').textContent, /Liquidity below configured minimum/);
  } finally {
    restoreFetch();
    dom.window.close();
  }
});

test('popup renders a live-only summary and the logo first in the header', async () => {
  const dom = setup('<div id="app"></div>');
  const restoreFetch = mockLiveFetch();
  try {
    await import('../dist/src/popup.js');
    await settle();
    assert.match(document.body.textContent, /Live scan/);
    assert.equal(document.querySelector('#popup-provider'), null);
    assert.equal(document.querySelectorAll('.popup-list > div').length, 1);
    assert.ok(document.querySelector('.popup-head .header-end .mark img'));
    assert.equal(document.querySelector('.popup-head > *').classList.contains('header-end'), true);
    assert.ok(document.querySelector('#open-dashboard'));
    assert.ok(document.querySelector('#refresh-popup'), 'the live popup has a manual refresh control');
    assert.match(document.body.textContent, /auto refresh 15s/i);
  } finally {
    restoreFetch();
    dom.window.close();
  }
});

test('popup settings tab saves research thresholds locally', async () => {
  const dom = setup('<div id="app"></div>');
  const restoreFetch = mockLiveFetch();
  try {
    await import('../dist/src/popup.js?settings-tab');
    await settle();
    document.querySelector('#tab-settings').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const score = document.querySelector('[data-popup-setting="minScore"]');
    assert.ok(score, 'the popup has a dedicated settings tab');
    score.value = '81';
    score.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(JSON.parse(localStorage.getItem('scout.settings.v1')).minScore, 81);

    const notifications = document.querySelector('#popup-notifications');
    notifications.checked = true;
    notifications.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(JSON.parse(localStorage.getItem('scout.settings.v1')).notifications, true);
    assert.ok(document.querySelector('[data-integration-pref="coinPopups"]'), 'coin panels can be disabled independently');
    assert.ok(document.querySelector('[data-integration-pref="rowHighlights"]'), 'row highlights can be disabled independently');
    const panels = document.querySelector('[data-integration-pref="coinPopups"]');
    assert.equal(panels.closest('.popup-feature-control')?.querySelector('em')?.textContent, 'ON');
    panels.checked = false;
    panels.dispatchEvent(new window.Event('change', { bubbles: true }));
    assert.equal(panels.closest('.popup-feature-control')?.querySelector('em')?.textContent, 'OFF', 'the switch says plainly whether it is enabled');
  } finally {
    restoreFetch();
    dom.window.close();
  }
});

test('clicking a coin in the popup opens that coin card and returns to the list', async () => {
  const dom = setup('<div id="app"></div>');
  const restoreFetch = mockLiveFetch();
  try {
    await import('../dist/src/popup.js?detail-view');
    await settle();
    const row = document.querySelector('.coin-row[data-mint]');
    assert.ok(row, 'the list renders clickable coins');
    const mint = row.dataset.mint;
    row.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

    const detail = document.querySelector('.popup-detail');
    assert.ok(detail, 'the clicked coin opens its detail card');
    assert.match(detail.textContent, /Entry conditions/);
    assert.match(detail.textContent, /Market cap/);
    assert.match(detail.textContent, /Estimated impact/);
    assert.match(detail.textContent, new RegExp(mint.slice(0, 6)));
    assert.ok(detail.querySelector('.coin.large'));
    assert.equal(document.querySelectorAll('.popup-list').length, 0, 'the list is replaced by the card');

    document.querySelector('#back-to-list').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    assert.equal(document.querySelectorAll('.coin-row').length, 1);
    assert.equal(document.querySelectorAll('.popup-detail').length, 0);
  } finally {
    restoreFetch();
    dom.window.close();
  }
});

test('the dashboard launchpad filter shows one platform at a time and remembers the choice', async () => {
  const dom = setup('<div id="app"></div>');
  const restoreFetch = mockTwoLaunchpadsFetch();
  try {
    await import('../dist/src/dashboard.js?launchpad-test');
    await settle();
    assert.equal(document.querySelectorAll('.token-card').length, 2);

    const pills = [...document.querySelectorAll('.protocol-pill[data-platform]')];
    const platforms = pills.map(pill => pill.dataset.platform);
    assert.deepEqual(platforms.slice(0, 2).sort(), ['pumpfun', 'raydium'], 'the launchpads in this scan come first');
    assert.ok(pills.every(pill => pill.classList.contains('is-on')), 'every launchpad is shown by default');
    assert.ok(pills.every(pill => pill.querySelector('.protocol-icon svg, .protocol-icon img')), 'every pill carries a launchpad mark');
    assert.equal(pills.includes(undefined), false, 'the quote filter never leaks into the launchpad pills');
    assert.equal(pills.find(pill => pill.dataset.platform === 'raydium').classList.contains('is-idle'), false);
    assert.equal(document.querySelector('.protocol-pill[data-platform="unknown"]'), null, 'the unknown bucket is not a launchpad, so it is not offered');

    // The rest of the catalogue is one click away, so a launchpad with nothing on
    // screen is still reachable instead of being invisible.
    const more = document.querySelector('#toggle-platforms');
    assert.match(more?.textContent ?? '', /^Show more \d+/);
    more.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const expanded = [...document.querySelectorAll('.protocol-pill[data-platform]')].map(pill => pill.dataset.platform);
    assert.ok(expanded.length > 24, 'every launchpad Axiom lists is offered, not only the ones on screen');
    assert.equal(new Set(expanded).size, expanded.length, 'no launchpad is listed twice');
    assert.equal(document.querySelector('.protocol-pill[data-platform="orca"]')?.classList.contains('is-idle'), true, 'a launchpad with nothing on screen reads as idle');
    assert.match(document.querySelector('.token-card .meta-chip--platform')?.textContent ?? '', /Raydium|pump\.fun/);

    const raydium = document.querySelector('.protocol-pill[data-platform="raydium"]');
    raydium.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(document.querySelectorAll('.token-card').length, 1, 'only the selected launchpad stays listed');
    assert.equal(document.querySelector('.token-card').dataset.mint, liveMint);
    assert.deepEqual(JSON.parse(localStorage.getItem('scout.platforms.v1')), ['raydium']);
    assert.equal(document.querySelector('.protocol-pill[data-platform="pumpfun"]')?.classList.contains('is-on'), false);

    document.querySelector('#select-all-platforms').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(document.querySelectorAll('.token-card').length, 2, 'Select all clears the launchpad filter');
    assert.deepEqual(JSON.parse(localStorage.getItem('scout.platforms.v1')), []);

    // The quote filter is the second axis: it narrows on the pool's quote asset.
    const quotes = [...document.querySelectorAll('.protocol-pill[data-quote]')];
    assert.deepEqual(quotes.map(pill => pill.getAttribute('data-quote')), ['sol', 'usdc', 'usdt', 'usd1', 'other'], 'the quote buckets never move around');
    const bucket = id => quotes.find(pill => pill.getAttribute('data-quote') === id);
    assert.equal(bucket('sol').querySelector('.protocol-count')?.textContent, '1');
    assert.equal(bucket('usdc').querySelector('.protocol-count')?.textContent, '1');
    assert.equal(bucket('usdt').querySelector('.protocol-count'), null, 'an empty bucket stays quiet');
    assert.equal(document.querySelector('#select-all-quotes')?.textContent, 'Clear all', 'the active all-state can be cleared in one click');

    bucket('usdc').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(document.querySelectorAll('.token-card').length, 1, 'only the USDC-quoted pool stays listed');
    assert.equal(document.querySelector('.token-card').dataset.mint, pumpMint);
    assert.deepEqual(JSON.parse(localStorage.getItem('scout.quotes.v1')), ['usdc']);

    document.querySelector('#select-all-quotes').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    assert.equal(document.querySelectorAll('.token-card').length, 2, 'clearing the quote filter brings the other pool back');
    assert.deepEqual(JSON.parse(localStorage.getItem('scout.quotes.v1')), []);
  } finally {
    restoreFetch();
    dom.window.close();
  }
});

test('dashboard escapes untrusted live token names', async () => {
  const dom = setup('<div id="app"></div>');
  const restoreFetch = mockLiveFetch();
  try {
    await import('../dist/src/dashboard.js?live-test');
    await settle();
    assert.match(document.body.textContent, /SCOUT \/ SOLANA/);
    assert.equal(document.querySelectorAll('[data-mint]').length, 1);
    assert.equal(document.querySelector('.token-card').classList.contains('signal-green'), false);
    assert.match(document.body.textContent, /Axiom Pulse/);
    assert.equal(document.querySelector('.detail-panel img'), null);
    assert.match(document.querySelector('.detail-panel').textContent, /<img src=x onerror=alert\(1\)>/);
    assert.match(document.querySelector('.detail-panel').textContent, /Token authority \/ extension checks/);
  } finally {
    restoreFetch();
    dom.window.close();
  }
});

test('companion tracks a pasted mint beside the live feed', async () => {
  const dom = setup('<div id="app"></div>');
  const originalFetch = globalThis.fetch;
  const now = Date.now();
  const mint = '22222222222222222222222222222222';
  const other = '33333333333333333333333333333333';
  const pool = '44444444444444444444444444444444';
  const feed = { data: [{ attributes: { address: pool, pool_created_at: new Date(now - 60000).toISOString(), reserve_in_usd: '9000', transactions: { m5: { buys: 1, sells: 1 } }, volume_usd: { m5: '100' } }, relationships: { base_token: { data: { id: `solana_${other}` } } } }], included: [{ id: `solana_${other}`, attributes: { address: other, name: 'Feed coin', symbol: 'FEED' } }] };
  globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('dexscreener') ? [{ chainId: 'solana', baseToken: { address: mint, name: 'Pinned coin', symbol: 'PIN' }, pairAddress: pool, pairCreatedAt: now - 60000, liquidity: { usd: 30000 }, volume: { m5: 5000 }, txns: { m5: { buys: 20, sells: 5 } }, priceChange: { m5: 8 } }] : feed), { status: 200 });
  try {
    localStorage.setItem('scout.provider.v1', 'live');
    await import('../dist/src/dashboard.js?pin-test');
    await settle();
    const input = document.querySelector('#mint-input');
    input.value = mint;
    document.querySelector('#mint-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    assert.equal(document.querySelectorAll('.token-card').length, 2);
    assert.match(document.querySelector('.detail-panel').textContent, /Pinned coin/);
    assert.match(document.querySelector('.detail-panel').textContent, /Open token on Axiom/);
    assert.equal(document.querySelector('.detail-panel a[href^="https://axiom.trade/t/"]').href, `https://axiom.trade/t/${mint}?chain=sol`);
    assert.equal(document.querySelector('.token-card[data-mint="'+mint+'"]').classList.contains('signal-green'), false);
    assert.equal(document.querySelectorAll('[data-remove-mint]').length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
});
