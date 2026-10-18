import test from 'node:test';
import assert from 'node:assert/strict';
import { assessVisibleMints, isAxiomPulseSender, isScoutSender, maxScanMints, registerContentRecovery, registerScanListener, scanMints, scanSurfaceForSender, withGmgnStats } from '../dist/src/background.js';
import { resetHolderAccountCache } from '../dist/src/rugcheck.js';
import { resetGmgnStatCache } from '../dist/src/gmgnStat.js';

const mint = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
const other = '11111111111111111111111111111111';
const failed = '22222222222222222222222222222222';
const looksGood = '33333333333333333333333333333333';

test('extension reload reconnects existing Axiom and GMGN tabs without duplicating controller state', async () => {
  let installed;
  let startup;
  let updated;
  const css = [];
  const removedCss = [];
  const scripts = [];
  const api = {
    runtime: {
      onInstalled: { addListener: listener => { installed = listener; } },
      onStartup: { addListener: listener => { startup = listener; } }
    },
    tabs: {
      query: async () => [
        { id: 1, url: `https://axiom.trade/meme/${mint}` },
        { id: 2, url: `https://gmgn.ai/sol/token/${mint}` },
        { id: 3, url: 'https://example.com/' }
      ],
      onUpdated: { addListener: listener => { updated = listener; } }
    },
    scripting: {
      removeCSS: async details => { removedCss.push(details); },
      insertCSS: async details => { css.push(details); },
      executeScript: async details => { scripts.push(details); }
    }
  };
  registerContentRecovery(api);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(scripts.map(call => call.files), [['axiomOverlay.js', 'tokenPage.js'], ['gmgn.js']]);
  assert.deepEqual(css.map(call => call.files), [['axiom-pulse.css', 'riskAlerts.css'], ['axiom-pulse.css', 'riskAlerts.css']]);
  assert.deepEqual(removedCss.map(call => call.files), [['axiom-pulse.css', 'riskAlerts.css'], ['axiom-pulse.css', 'riskAlerts.css']]);
  assert.equal(typeof installed, 'function');
  assert.equal(typeof startup, 'function');

  updated(4, { status: 'complete' }, { url: `https://axiom.trade/meme/${other}` });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(scripts.at(-1), { target: { tabId: 4 }, files: ['axiomOverlay.js', 'tokenPage.js'] });
});

test('GMGN holder evidence enriches every scan without overwriting stronger data', () => {
  const token = {
    mint, chain: 'solana', name: 'Coin', symbol: 'COIN', stage: 'new', launchedAt: null, observedAt: Date.now(),
    priceUsd: 1, marketCapUsd: null, fdvUsd: null, liquidityUsd: 50_000, liquidityChangePct: null,
    priceChange5mPct: 2, imageUrl: null, trades: [], holders: null, holderCount: 900,
    developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: '' },
    mintAuthority: null, freezeAuthority: null, transferRestriction: null, migrationProgressPct: null, provider: 'Market'
  };
  const enriched = withGmgnStats(token, {
    holderCount: 1200, top10Pct: 42, creatorHoldingPct: 3.5,
    quality: { devLaunches: 5, bundlerPct: 8, sniperPct: 4, botDegenPct: null, freshWalletPct: 12 }
  });
  assert.equal(enriched.holderCount, 900, 'an existing provider answer wins');
  assert.equal(enriched.top10HoldPct, 42);
  assert.equal(enriched.developerHoldingPct, 3.5);
  assert.equal(enriched.holderQuality.devLaunches, 5);
  assert.match(enriched.provider, /GMGN holder stats/);
});

test('background scan accepts only bounded full mints and real Pulse senders', () => {
  assert.deepEqual(scanMints(['JUP', mint, mint, other, null, '1111...1111']), [mint, other]);
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  assert.equal(scanMints(Array.from({ length: maxScanMints + 3 }, (_, index) => '1'.repeat(31) + alphabet[index])).length, maxScanMints);
  assert.equal(isAxiomPulseSender({ url: 'https://axiom.trade/pulse?chain=sol' }), true);
  assert.equal(isAxiomPulseSender({ url: 'https://axiom.trade/pulse/' }), true);
  assert.equal(isAxiomPulseSender({ url: 'https://axiom.trade/pulse-evil' }), false);
  assert.equal(isAxiomPulseSender({ url: 'https://lookalike-axiom.trade/pulse' }), false);
  assert.equal(isAxiomPulseSender({ url: 'http://axiom.trade/pulse' }), false);
  assert.equal(isAxiomPulseSender({ url: 'not a URL' }), false);
});

test('authorized sender covers Axiom token pages and GMGN, but rejects lookalikes', () => {
  assert.equal(isScoutSender({ url: 'https://axiom.trade/pulse?chain=sol' }), true);
  assert.equal(isScoutSender({ url: `https://axiom.trade/t/${mint}?chain=sol` }), true);
  assert.equal(isScoutSender({ url: `https://axiom.trade/meme/${mint}` }), true);
  assert.equal(isScoutSender({ url: `https://gmgn.ai/sol/token/${mint}` }), true);
  assert.equal(isScoutSender({ url: 'https://www.gmgn.ai/sol/trenches' }), true);
  assert.equal(isScoutSender({ url: 'https://gmgn.ai.evil.test/sol/token/x' }), false);
  assert.equal(isScoutSender({ url: 'http://gmgn.ai/sol/token/x' }), false);
  assert.equal(isScoutSender({ url: 'https://evil.example/pulse' }), false);
});

test('pool resolution follows the actual page route, never the number of visible rows', () => {
  assert.equal(scanSurfaceForSender({ url: 'https://axiom.trade/pulse?chain=sol' }), 'list');
  assert.equal(scanSurfaceForSender({ url: 'https://gmgn.ai/sol/trenches' }), 'list');
  assert.equal(scanSurfaceForSender({ url: `https://axiom.trade/terminal/${mint}` }), 'token-page');
  assert.equal(scanSurfaceForSender({ url: `https://gmgn.ai/sol/token/${mint}` }), 'token-page');
  assert.equal(scanSurfaceForSender({ url: 'https://axiom.trade/pulse', tab: { url: `https://axiom.trade/t/${mint}` } }), 'list', 'the sending frame URL wins over a different tab URL');
});

test('one visible list mint still requires an exact market match', async () => {
  const rowAddress = 'ErrPZe43BFZqg9pyN5VPUwjTe5h7Dy5Fp7QZ9tKoxw';
  const oldFetch = globalThis.fetch;
  let pairResolution = false;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes('/latest/dex/pairs/')) { pairResolution = true; return new Response('{}', { status: 200 }); }
    if (target.includes('/token-pairs/v1/solana/')) return new Response('[]', { status: 200 });
    if (target.includes('geckoterminal')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    if (target.includes('gopluslabs')) return new Response(JSON.stringify({ code: 1, result: {} }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  try {
    const response = await assessVisibleMints([rowAddress], Date.now(), 'list');
    assert.deepEqual(response.assessments, []);
    assert.equal(pairResolution, false, 'a one-row list cannot follow a pool into another token');
  } finally { globalThis.fetch = oldFetch; }
});

test('the sender rule authorizes by host, so a renamed Axiom route cannot refuse a real scan', () => {
  // This rule used to re-derive the route here. Axiom renames routes, so an unrecognised
  // one was refused while the content script had already resolved the mint, the scan
  // never ran and the popup blamed the coin for having no data. That happened twice, so
  // the route shape is no longer mirrored here at all.
  assert.equal(isScoutSender({ url: `https://axiom.trade/terminal/${mint}` }), true);
  assert.equal(isScoutSender({ url: `https://axiom.trade/chart/${mint}` }), true);
  assert.equal(isScoutSender({ url: `https://axiom.trade/t/${mint}/chart` }), true);
  assert.equal(isScoutSender({ url: `https://axiom.trade/whatever-they-rename-it-to/${mint}` }), true, 'a route nobody has seen yet must still scan');
  // The host is the check. A page with no mint never sends a scan, so allowing the host
  // does not spend quota; the lookalike and scheme rules are what keep it honest.
  assert.equal(isScoutSender({ url: 'https://axiom.trade/' }), true);
  assert.equal(isScoutSender({ url: 'https://axiom.trade/discover' }), true);
  assert.equal(isScoutSender({ url: `https://axiom.trade.evil.test/t/${mint}` }), false);
  assert.equal(isScoutSender({ url: `http://axiom.trade/t/${mint}` }), false);
  assert.equal(isScoutSender({ url: undefined }), false);
});

test('background scan keys independent market and risk evidence to the exact mint', async () => {
  const oldFetch = globalThis.fetch;
  const oldChrome = globalThis.chrome;
  const calls = [];
  const now = Date.now();
  globalThis.chrome = { storage: { local: { get: async () => ({ 'scout.settings.v1': { minLiquidityUsd: 25000 } }) } } };
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (String(url).startsWith('https://api.dexscreener.com/')) {
      return new Response(JSON.stringify([
        { chainId: 'solana', baseToken: { address: other, symbol: 'SAME' }, liquidity: { usd: 999999 } },
        { chainId: 'solana', baseToken: { address: mint, symbol: 'SAME' }, liquidity: { usd: 30000 }, txns: { m5: { buys: 10, sells: 2 } }, volume: { m5: 5000 }, priceChange: { m5: 5 } }
      ]), { status: 200 });
    }
    const requested = new URL(url).searchParams.get('contract_addresses');
    return new Response(JSON.stringify({ code: 1, result: { [other]: { freezable: { status: '0' } }, [requested]: { freezable: { status: '1' } } } }), { status: 200 });
  };
  try {
    const response = await assessVisibleMints([mint, mint, 'SAME'], now);
    assert.deepEqual(response.errors, []);
    assert.equal(response.settings.minLiquidityUsd, 25000);
    assert.equal(response.assessments.length, 1);
    const [assessment] = response.assessments;
    assert.equal(assessment.token.mint, mint);
    assert.equal(assessment.token.liquidityUsd, 30000);
    assert.equal(assessment.token.freezeAuthority, true);
    assert.equal(assessment.status, 'DISQUALIFIED');
    assert.equal(assessment.token.developer.creator, null);
    assert.equal(assessment.expiresAt > now, true);
    assert.equal(calls.filter(url => url.includes('token-pairs/v1')).length, 1, 'one market lookup for the exact mint');
    assert.equal(calls.filter(url => url.includes('gopluslabs')).length, 1);
    // A single-mint (token page) request also checks the feed for same-ticker copies.
    assert.equal(calls.filter(url => url.includes('/latest/dex/search')).length, 1);
    assert.deepEqual(response.vamps, [], 'an unexpected search payload never invents a copy');
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.chrome = oldChrome;
  }
});

test('a holder report that never answers cannot hold up a scan that does not need it', async () => {
  // The report is quick for a brand-new token but took over 13 seconds for an
  // established one. Awaiting it unconditionally pushed those scans past the caller's
  // timeout, which then reported the scanner as unreachable. It is now started up front
  // and only waited on when the other providers came up empty.
  // Its own mint: the provider caches are module-level and shared across these tests.
  const holderMint = 'ABCDEFGHJKLMNPQRSTUVWXYZ1111111111111';
  const oldFetch = globalThis.fetch;
  const now = Date.now();
  const calls = [];
  resetHolderAccountCache();
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).includes('rugcheck')) {
      // Answers only when the request is abandoned, exactly as a stalled request does
      // in the extension. Nothing may be left waiting on it.
      return new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('The operation was aborted.')), { once: true });
      });
    }
    if (String(url).includes('dexscreener')) return new Response(JSON.stringify([{
      chainId: 'solana', baseToken: { address: holderMint, symbol: 'EST' },
      liquidity: { usd: 120000 }, volume: { m5: 20000 }, txns: { m5: { buys: 50, sells: 4 } }, priceChange: { m5: 8 }
    }]), { status: 200 });
    // A security provider that returns a full holder list, so the report is not needed.
    return new Response(JSON.stringify({ code: 1, result: { [holderMint]: {
      freezable: { status: '0' }, holders: Array.from({ length: 10 }, (_, i) => ({ account: `${'1'.repeat(31)}${'123456789ABCDEFGHJKLMNPQRSTUVWXYZ'[i]}`, percent: '0.005' })),
      holder_count: '500'
    } } }), { status: 200 });
  };
  try {
    const response = await assessVisibleMints([holderMint], now);
    assert.equal(response.assessments.length, 1);
    assert.equal(calls.some(url => url.includes('rugcheck')), true, 'the report is started early so it is ready if needed');
    assert.equal(response.assessments[0].token.holders?.length, 10, 'and the providers own answer is used as-is');
  } finally {
    globalThis.fetch = oldFetch;
    resetHolderAccountCache();
  }
});

test('a coin no market indexer lists is still described, and says where the figures came from', async () => {
  // Both indexers have gaps: DEX Screener lags a launch, and the GeckoTerminal
  // per-token endpoint has no pool for some coins. When neither answered, the popup
  // used to show a scorecard of "Unknown" with a 0/100 score, which reads as a broken
  // extension rather than a coin nobody has indexed yet.
  const orphanMint = 'ABCDEFGHJKLMNPQRSTUVWXYZ2222222222222';
  const oldFetch = globalThis.fetch;
  const now = Date.now();
  resetHolderAccountCache();
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes('dexscreener')) return new Response('[]', { status: 200 });
    if (target.includes('geckoterminal')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    // A security provider with nothing either, so only the report can describe it.
    if (target.includes('gopluslabs')) return new Response(JSON.stringify({ code: 1, result: {} }), { status: 200 });
    return new Response(JSON.stringify({
      mint: orphanMint,
      tokenMeta: { name: 'Orphan', symbol: 'ORPH' },
      price: 0.000136,
      totalMarketLiquidity: 4210.5,
      totalHolders: 42,
      topHolders: []
    }), { status: 200 });
  };
  try {
    const response = await assessVisibleMints([orphanMint], now);
    const assessment = response.assessments[0];
    assert.ok(assessment, 'the coin still gets an assessment rather than disappearing');
    const token = assessment.token;
    assert.equal(token.symbol, 'ORPH', 'the coin is named instead of showing a placeholder');
    assert.equal(token.name, 'Orphan');
    assert.equal(token.priceUsd, 0.000136);
    assert.equal(token.liquidityUsd, 4210.5, 'a real liquidity figure, so the thin-pool warning can fire honestly');
    assert.equal(token.holderCount, 42);
    assert.match(token.provider, /token report/, 'the popup can show which source these came from');
  } finally {
    globalThis.fetch = oldFetch;
    resetHolderAccountCache();
  }
});

test('GMGN stats make an unindexed Axiom mint useful without waiting for the slow holder report', async () => {
  const statMint = 'ABCDEFGHJKLMNPQRSTUVWXYZ5555555555555';
  const oldFetch = globalThis.fetch;
  const now = Date.now();
  resetHolderAccountCache();
  resetGmgnStatCache();
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes('dexscreener')) return new Response('[]', { status: 200 });
    if (target.includes('geckoterminal')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    if (target.includes('gopluslabs')) return new Response(JSON.stringify({ code: 1, result: {} }), { status: 200 });
    if (target.includes('gmgn.ai/api/v1/token_stat')) return new Response(JSON.stringify({
      code: 0,
      data: { holder_count: '4261', top_10_holder_rate: '0.467', creator_hold_rate: '0.03', creator_created_count: '7' }
    }), { status: 200 });
    if (target.includes('rugcheck')) return new Promise(() => {});
    throw new Error(`Unexpected URL ${target}`);
  };
  try {
    const response = await assessVisibleMints([statMint], now);
    const token = response.assessments[0]?.token;
    assert.ok(token, 'GMGN context should produce an Axiom assessment before the holder report returns');
    assert.equal(token.holderCount, 4261);
    assert.equal(token.top10HoldPct, 46.7);
    assert.equal(token.developerHoldingPct, 3);
    assert.equal(token.holderQuality?.devLaunches, 7);
  } finally {
    globalThis.fetch = oldFetch;
    resetHolderAccountCache();
    resetGmgnStatCache();
  }
});

test('the developer wallet is filled in without moving the verdict', async () => {
  // Knowing a wallet is not the same as having a launch history. The popup gains the
  // address and the holding, but `source` must stay unknown or the developer score and
  // the entry conditions would quietly change on the strength of one address.
  const devMint = 'ABCDEFGHJKLMNPQRSTUVWXYZ3333333333333';
  const creator = 'FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM';
  const oldFetch = globalThis.fetch;
  const now = Date.now();
  resetHolderAccountCache();
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes('dexscreener')) return new Response(JSON.stringify([{
      chainId: 'solana', baseToken: { address: devMint, symbol: 'DEV' },
      liquidity: { usd: 40000 }, volume: { m5: 8000 }, txns: { m5: { buys: 40, sells: 20 } }, priceChange: { m5: 3 }
    }]), { status: 200 });
    if (target.includes('gopluslabs')) return new Response(JSON.stringify({ code: 1, result: {} }), { status: 200 });
    if (target.includes('rugcheck')) return new Response(JSON.stringify({
      mint: devMint, creator, creatorBalance: 250, token: { supply: 1000 }, totalHolders: 12, topHolders: []
    }), { status: 200 });
    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  };
  try {
    const response = await assessVisibleMints([devMint], now);
    const token = response.assessments[0]?.token;
    assert.ok(token);
    assert.equal(token.developer.creator, creator, 'the deploying wallet is now on screen');
    assert.equal(token.developerHoldingPct, 25, 'and what it still holds');
    assert.equal(token.developer.source, 'unknown', 'but the verdict is not told to trust it');
    assert.match(token.developer.note, /token report/, 'and the popup can say where the address came from');
  } finally {
    globalThis.fetch = oldFetch;
    resetHolderAccountCache();
  }
});

test('failed market lookup yields no assessment and cannot retain a highlight', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network offline'); };
  try {
    const response = await assessVisibleMints([failed], Date.now());
    assert.deepEqual(response.assessments, []);
    assert.equal(response.errors.length, 1);
    assert.match(response.errors[0], /market lookup unavailable/);
  } finally { globalThis.fetch = oldFetch; }
});

test('a coin no feed can describe is reported as a miss, never scored as 0/100', async () => {
  const oldFetch = globalThis.fetch;
  const placeholder = '9'.repeat(32);
  globalThis.fetch = async url => {
    const target = String(url);
    // Both market sources answer, but neither knows this mint, so each returns the
    // empty stand-in rather than throwing.
    if (target.startsWith('https://api.dexscreener.com/')) return new Response(JSON.stringify([]), { status: 200 });
    if (target.startsWith('https://api.geckoterminal.com/')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    throw new Error('unavailable');
  };
  try {
    const response = await assessVisibleMints([placeholder], Date.now());
    assert.deepEqual(response.assessments, [], 'an unindexed mint must not produce a scored assessment');
    assert.ok(response.errors.some(error => /no pool for this mint/i.test(error)), 'and the miss must be reported so the popup can explain itself');
  } finally {
    globalThis.fetch = oldFetch;
    resetHolderAccountCache();
  }
});

test('strong public market activity cannot become a green candidate without creator evidence', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    if (String(url).includes('dexscreener')) return new Response(JSON.stringify([{
      chainId: 'solana', baseToken: { address: looksGood, symbol: 'GOOD' },
      liquidity: { usd: 120000 }, volume: { m5: 20000 }, txns: { m5: { buys: 50, sells: 4 } }, priceChange: { m5: 8 }
    }]), { status: 200 });
    return new Response(JSON.stringify({ code: 1, result: { [looksGood]: {
      mintable: { status: '0' }, freezable: { status: '0' }, non_transferable: '0', default_account_state: '1',
      transfer_hook: [], transfer_fee: {}, balance_mutable_authority: { status: '0' }, closable: { status: '0' },
      default_account_state_upgradable: { status: '0' }, transfer_hook_upgradable: { status: '0' }, transfer_fee_upgradable: { status: '0' }
    } } }), { status: 200 });
  };
  try {
    const response = await assessVisibleMints([looksGood], Date.now());
    assert.equal(response.assessments.length, 1);
    assert.equal(response.assessments[0].token.freezeAuthority, false);
    assert.equal(response.assessments[0].token.developer.creator, null);
    assert.notEqual(response.assessments[0].status, 'TOP CANDIDATE');
  } finally { globalThis.fetch = oldFetch; }
});

test('runtime listener rejects unrelated pages before making a network request', () => {
  let listener;
  registerScanListener({ runtime: { onMessage: { addListener: callback => { listener = callback; } } } });
  assert.equal(typeof listener, 'function');
  let response;
  const keepOpen = listener({ type: 'SCOUT_ASSESS_MINTS', mints: [mint] }, { url: 'https://evil.example/pulse' }, value => { response = value; });
  assert.equal(keepOpen, false);
  assert.deepEqual(response.assessments, []);
  assert.match(response.errors[0], /not sent from an authorized page/);
  assert.equal(listener({ type: 'UNRELATED', mints: [mint] }, { url: 'https://axiom.trade/pulse' }, () => {}), false);
});
