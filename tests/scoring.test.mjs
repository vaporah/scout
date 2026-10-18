import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTokens } from '../dist/src/provider.js';
import { assess } from '../dist/src/scoring.js';
import { defaults, validSettings } from '../dist/src/settings.js';
import { readFile, stat } from 'node:fs/promises';
import { parseGeckoPools } from '../dist/src/gecko.js';

test('demo feed has distinct simulated mints and bounded scores', async () => {
  const now = Date.now();
  const tokens = await fetchTokens('demo', now);
  assert.ok(tokens.length > 0);
  assert.equal(new Set(tokens.map(t => t.mint)).size, tokens.length);
  for (const token of tokens) {
    assert.match(token.mint, /^Demo/);
    assert.equal(token.provider, 'SIMULATED DEMO');
    const result = assess(token, defaults, now);
    assert.ok(result.score >= 0 && result.score <= 100);
  }
});

test('critical token control risk disqualifies a candidate', async () => {
  const now = Date.now();
  const [first] = await fetchTokens('demo', now);
  assert.ok(first);
  assert.equal(assess(first, defaults, now).status, 'TOP CANDIDATE');
  const unsafe = { ...first, freezeAuthority: true };
  const result = assess(unsafe, defaults, now);
  assert.equal(result.status, 'DISQUALIFIED');
  assert.ok(result.critical.some(reason => reason.includes('Freeze authority')));
});

test('missing security and creator evidence prevents top candidate status', async () => {
  const now = Date.now();
  const [first] = await fetchTokens('demo', now);
  assert.ok(first);
  const unknown = { ...first, mintAuthority: null, freezeAuthority: null, transferRestriction: null, developer: { ...first.developer, source: 'unknown', creator: null, priorLaunches: null } };
  const result = assess(unknown, defaults, now);
  assert.notEqual(result.status, 'TOP CANDIDATE');
  assert.ok(result.missing.length > 0);
});

test('extreme provider-classified launch wallets produce a high-risk scan', async () => {
  const now = Date.now();
  const [first] = await fetchTokens('demo', now);
  assert.ok(first);
  const clustered = {
    ...first,
    holderQuality: { devLaunches: 4, bundlerPct: 55, sniperPct: 12, botDegenPct: 8, freshWalletPct: 20 }
  };
  const result = assess(clustered, defaults, now);
  assert.equal(result.status, 'HIGH RISK');
  assert.ok(result.warnings.some(reason => /bundled launch buys/.test(reason)));
});

test('settings are clamped and invalid values fall back to defaults', () => {
  const settings = validSettings({ refreshSeconds: 1, maxSlippagePct: 99, minScore: Number.NaN });
  assert.equal(settings.refreshSeconds, 10);
  assert.equal(settings.maxSlippagePct, 20);
  assert.equal(settings.minScore, defaults.minScore);
});

test('built extension manifest points to packaged assets', async () => {
  const manifest = JSON.parse(await readFile(new URL('../dist/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.name, 'Scout');
  assert.deepEqual(manifest.host_permissions, ['https://axiom.trade/*', 'https://gmgn.ai/*', 'https://trade.padre.gg/*', 'https://api.geckoterminal.com/*', 'https://api.dexscreener.com/*', 'https://api.gopluslabs.io/*', 'https://api.rugcheck.xyz/*']);
  const files = [manifest.action.default_popup, ...Object.values(manifest.action.default_icon), ...Object.values(manifest.icons), 'scout-raccoon-logo.png', 'dashboard.html', 'styles.css', 'live.css', 'axiom-pulse.css', 'riskAlerts.css', 'axiomOverlay.js', 'tokenPage.js', 'gmgn.js', 'padre.js', 'src/background.js', 'src/popup.js', 'src/dashboard.js', 'src/analysis.js', 'src/dex.js'];
  for (const file of files) {
    assert.doesNotMatch(file, /\.svg$/i);
    assert.ok((await stat(new URL(`../dist/${file}`, import.meta.url))).size > 0, file);
  }
});

test('live pool mapping preserves real metrics and unknown security evidence', () => {
  const now = Date.now();
  const mint = '11111111111111111111111111111111';
  const pool = '22222222222222222222222222222222';
  const quote = 'So11111111111111111111111111111111111111112';
  const payload = { data: [{ attributes: { address: pool, pool_created_at: new Date(now - 120_000).toISOString(), base_token_price_usd: '0.001', reserve_in_usd: '20000', price_change_percentage: { m5: '12' }, transactions: { m5: { buys: 22, sells: 4, buyers: 14, sellers: 3 } }, volume_usd: { m5: '4000', m15: '7000' } }, relationships: { base_token: { data: { id: `solana_${mint}` } }, dex: { data: { id: 'raydium' } }, quote_token: { data: { id: `solana_${quote}` } } } }], included: [{ id: `solana_${mint}`, attributes: { address: mint, name: '<script>bad</script>', symbol: 'LIVE' } }, { id: `solana_${quote}`, attributes: { address: quote, name: 'Wrapped SOL', symbol: 'SOL' } }] };
  const [token] = parseGeckoPools(payload, now);
  assert.ok(token);
  assert.equal(token.priceUsd, .001);
  assert.equal(token.marketSnapshot.buys5m, 22);
  assert.equal(token.marketSnapshot.volume5m, 4000);
  // Both filter axes come out of the same payload: launchpad and quote asset.
  assert.equal(token.dexName, 'raydium');
  assert.equal(token.quoteSymbol, 'SOL');
  assert.equal(token.freezeAuthority, null);
  assert.equal(token.developer.source, 'unknown');
  assert.equal(token.trades.length, 0);
  assert.match(token.sourceUrl, /geckoterminal\.com/);
  const result = assess(token, defaults, now);
  assert.equal(result.status, 'WATCH');
  assert.notEqual(result.status, 'TOP CANDIDATE');
  assert.ok(result.missing.some(item => item.includes('authority')));
});

test('a pool with no reported quote asset stays unknown rather than being guessed', () => {
  const now = Date.now();
  const mint = '11111111111111111111111111111111';
  const pool = '22222222222222222222222222222222';
  const payload = { data: [{ attributes: { address: pool, pool_created_at: new Date(now - 120_000).toISOString(), reserve_in_usd: '20000' }, relationships: { base_token: { data: { id: `solana_${mint}` } } } }], included: [{ id: `solana_${mint}`, attributes: { address: mint, name: 'No Quote', symbol: 'NQ' } }] };
  const [token] = parseGeckoPools(payload, now);
  assert.equal(token.quoteSymbol, null);
  assert.equal(token.dexName, null);
});

/**
 * A fresh pair as the pool feed describes it: trades are aggregated, the creator is
 * unverified, and unique buying wallets are simply not published.
 */
function freshPool(now, overrides = {}) {
  const { snapshot, ...rest } = overrides;
  return {
    mint: '11111111111111111111111111111111', chain: 'solana', name: 'Catnip', symbol: 'CATNIP', stage: 'new',
    launchedAt: now - 180_000, observedAt: now,
    priceUsd: 0.001, marketCapUsd: 50000, fdvUsd: 50000, liquidityUsd: 20000, liquidityChangePct: null,
    priceChange5mPct: 10, imageUrl: null, trades: [], holders: null,
    developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: '' },
    mintAuthority: false, freezeAuthority: false, transferRestriction: false, migrationProgressPct: null,
    provider: 'test',
    marketSnapshot: { volume5m: 40_000, volume15m: 0, buys5m: 60, sells5m: 30, buyers5m: null, sellers5m: null, ...snapshot },
    ...rest
  };
}

test('an unpublished unique-buyer count is not read as nobody buying', () => {
  const now = Date.now();
  const quiet = assess(freshPool(now, { snapshot: { buys5m: 0, sells5m: 0, volume5m: 0 } }), defaults, now);
  const moving = assess(freshPool(now), defaults, now);
  assert.equal(moving.analytics.buyers5m, null, 'the count stays unknown rather than becoming zero');
  assert.ok(moving.components.momentum > 0, 'the published buy count is enough evidence that people are buying');
  assert.ok(quiet.components.momentum < moving.components.momentum, 'a coin with no trades still scores nothing');
});

test('a pool turned over inside five minutes is credited and says why', () => {
  const now = Date.now();
  const hot = assess(freshPool(now), defaults, now);
  assert.ok(hot.positives.some(reason => reason.includes('2.0\u00d7 the pool liquidity')), `expected the turnover reason, got ${JSON.stringify(hot.positives)}`);
  assert.equal(hot.status, 'WATCH', 'strong verified activity on a healthy pool is worth flagging');
  assert.notEqual(hot.status, 'TOP CANDIDATE', 'but never a green candidate without creator evidence');
});

test('the score rises with how hard a coin is actually trading', () => {
  const now = Date.now();
  // These four are all the same coin as far as creator, holders and token controls go,
  // none of it is published. Only the trading differs, and the score has to reflect it.
  // It used to give a coin doing 30% of its pool exactly the same score as one doing
  // almost nothing, and 10x turnover exactly the same as 2x.
  const score = snapshot => assess(freshPool(now, { snapshot }), defaults, now).score;
  const dead = score({ volume5m: 0, buys5m: 0, sells5m: 0 });
  const quiet = score({ volume5m: 800, buys5m: 12, sells5m: 10 });
  const ticking = score({ volume5m: 6000, buys5m: 60, sells5m: 40 });
  const running = score({ volume5m: 40_000, buys5m: 300, sells5m: 180 });
  const raging = score({ volume5m: 200_000, buys5m: 900, sells5m: 300 });
  assert.ok(dead < quiet, `dead ${dead} should be below quiet ${quiet}`);
  assert.ok(quiet < ticking, `quiet ${quiet} should be below ticking ${ticking}`);
  assert.ok(ticking < running, `ticking ${ticking} should be below running ${running}`);
  assert.ok(running < raging, `running ${running} should be below raging ${raging}`);
});

test('a deep pool with ordinary volume is not credited with turnover it never had', () => {
  const now = Date.now();
  // $20k of volume against half a million of liquidity is nothing, and must not be
  // reported as if the pool were turning over. (A coin like this can still reach WATCH
  // on its buy/sell counts, which is a separate and older rule, so what must not happen
  // is the turnover claim.)
  const calm = assess(freshPool(now, { liquidityUsd: 500_000, snapshot: { volume5m: 20_000 } }), defaults, now);
  const hot = assess(freshPool(now), defaults, now);
  assert.equal(calm.positives.some(reason => reason.includes('pool liquidity')), false);
  assert.ok(calm.components.momentum < hot.components.momentum, 'turnover is what separates the two, and the calm pool does not earn it');
});
