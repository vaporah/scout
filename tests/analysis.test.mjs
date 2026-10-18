import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fetchTokens } from '../dist/src/provider.js';
import { assessTokens } from '../dist/src/analysis.js';
import { defaults } from '../dist/src/settings.js';
import { signalClass } from '../dist/src/ui.js';
import { saveSignals, loadCurrentSignals, loadSignalHistory } from '../dist/src/signalStore.js';
import { JSDOM } from 'jsdom';
import { parseDexPairs, addTrackedMint, loadTrackedMints, removeTrackedMint } from '../dist/src/dex.js';

test('packaged extension injects only the local Axiom highlighter and token-page warning', async () => {
  const manifest = JSON.parse(await readFile(new URL('../dist/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://axiom.trade/*']);
  assert.deepEqual(manifest.content_scripts[0].js, ['axiomOverlay.js', 'tokenPage.js']);
  assert.deepEqual(manifest.content_scripts[0].css, ['axiom-pulse.css', 'riskAlerts.css']);
  assert.equal(manifest.background.service_worker, 'src/background.js');
  assert.equal(manifest.background.type, 'module');
  assert.deepEqual(manifest.host_permissions, ['https://axiom.trade/*', 'https://gmgn.ai/*', 'https://trade.padre.gg/*', 'https://api.geckoterminal.com/*', 'https://api.dexscreener.com/*', 'https://api.gopluslabs.io/*', 'https://api.rugcheck.xyz/*']);
  for (const path of ['../dist/src/overlay.js', '../dist/overlay.css'])
    await assert.rejects(stat(new URL(path, import.meta.url)));
});

test('exact mint lookup ignores a same-name coin and keeps unsupported checks unknown', () => {
  const now = Date.now();
  const mint = '11111111111111111111111111111111';
  const impostor = '22222222222222222222222222222222';
  const payload = [
    { chainId: 'solana', baseToken: { address: impostor, name: 'Same name', symbol: 'SAME' }, liquidity: { usd: 500000 } },
    { chainId: 'solana', baseToken: { address: mint, name: 'Same name', symbol: 'SAME' }, pairAddress: '33333333333333333333333333333333', pairCreatedAt: now - 60000, liquidity: { usd: 25000 }, volume: { m5: 6000 }, txns: { m5: { buys: 15, sells: 3 } }, priceChange: { m5: 8 } }
  ];
  const token = parseDexPairs(payload, mint, now);
  assert.equal(token.mint, mint);
  assert.equal(token.liquidityUsd, 25000);
  assert.equal(token.stage, 'unknown');
  assert.equal(token.developer.creator, null);
  assert.equal(token.freezeAuthority, null);
  // DEX Screener publishes buy and sell counts but not unique buyers. Reporting that as
  // zero claimed nobody had bought, which zeroed the whole momentum score on every row.
  assert.equal(token.marketSnapshot.buyers5m, null);
  assert.equal(token.marketSnapshot.sellers5m, null);
  assert.equal(token.marketSnapshot.buys5m, 15, 'the counts it does publish are kept');
  assert.notEqual(assessTokens([token], defaults, now, new Set([mint]))[0].status, 'TOP CANDIDATE');
  const older = { ...token, launchedAt: now - 45 * 24 * 60 * 60 * 1000 };
  assert.equal(assessTokens([older], defaults, now).length, 0);
  assert.equal(assessTokens([older], defaults, now, new Set([mint])).length, 1);
});

test('pinned mints require full base58 addresses and persist independently', () => {
  const dom = new JSDOM('', { url: 'https://scout.test/' });
  const prior = globalThis.localStorage;
  globalThis.localStorage = dom.window.localStorage;
  try {
    const mint = '11111111111111111111111111111111';
    assert.throws(() => addTrackedMint('SAME'));
    addTrackedMint(mint);
    addTrackedMint(mint);
    assert.deepEqual(loadTrackedMints(), [mint]);
    removeTrackedMint(mint);
    assert.deepEqual(loadTrackedMints(), []);
  } finally {
    globalThis.localStorage = prior;
    dom.window.close();
  }
});

test('shared mint-keyed analysis rejects duplicate and invalid live identities', async () => {
  const now = Date.now();
  const [sample] = await fetchTokens('demo', now);
  const mint = '11111111111111111111111111111111';
  const early = { ...sample, mint, provider: 'Live fixture', observedAt: now - 1000 };
  const recent = { ...early, observedAt: now, liquidityUsd: 30000 };
  const results = assessTokens([early, { ...early, mint: 'same-ticker' }, recent], defaults, now);
  assert.equal(results.length, 1);
  assert.equal(results[0].token.liquidityUsd, 30000);
});

test('green is reserved for a fresh top candidate', async () => {
  const now = Date.now();
  const [sample] = await fetchTokens('demo', now);
  const top = assessTokens([sample], defaults, now)[0];
  assert.equal(top.status, 'TOP CANDIDATE');
  assert.equal(signalClass(top, defaults), 'signal-green');
  const unknown = assessTokens([{ ...sample, provider: 'Live fixture', mint: '11111111111111111111111111111111', developer: { ...sample.developer, source: 'unknown', creator: null }, mintAuthority: null, freezeAuthority: null, transferRestriction: null }], defaults, now)[0];
  assert.notEqual(unknown.status, 'TOP CANDIDATE');
  assert.notEqual(signalClass(unknown, defaults), 'signal-green');
  const stale = assessTokens([{ ...sample, observedAt: now - 300000 }], defaults, now)[0];
  assert.notEqual(stale.status, 'TOP CANDIDATE');
  assert.notEqual(signalClass(stale, defaults), 'signal-green');
});

test('FARMER DEV requires multiple verified transaction evidence categories and overrides score', async () => {
  const now = Date.now();
  const [sample] = await fetchTokens('demo', now);
  const base = { ...sample, developer: { ...sample.developer, source: 'verified', farmerEvidence: { linkedWallets: ['wallet1', 'wallet2', 'wallet3'], fundingTransactions: ['fundTx'], distributionTransactions: ['distributionTx'], coordinatedSaleTransactions: [] } } };
  const insufficient = assessTokens([base], defaults, now)[0];
  assert.notEqual(insufficient.farmer, true);
  const supported = assessTokens([{ ...base, developer: { ...base.developer, farmerEvidence: { ...base.developer.farmerEvidence, coordinatedSaleTransactions: ['saleTx1', 'saleTx2'] } } }], defaults, now)[0];
  assert.equal(supported.farmer, true);
  assert.equal(supported.status, 'DISQUALIFIED');
  assert.ok(supported.critical.some(item => item.includes('FARMER DEV')));
  assert.notEqual(signalClass(supported, defaults), 'signal-green');
});

test('shared signal state records transitions and expires stale signals', async () => {
  const dom = new JSDOM('', { url: 'https://scout.test/' });
  const prior = globalThis.localStorage;
  globalThis.localStorage = dom.window.localStorage;
  try {
    const now = Date.now();
    const [sample] = await fetchTokens('demo', now);
    const [top] = assessTokens([sample], defaults, now);
    saveSignals('demo', [top], now);
    saveSignals('demo', [top], now + 1000);
    assert.equal(loadCurrentSignals('demo', now).length, 1);
    assert.equal(loadSignalHistory('demo', sample.mint).length, 1);
    const [unsafe] = assessTokens([{ ...sample, freezeAuthority: true }], defaults, now + 2000);
    saveSignals('demo', [unsafe], now + 2000);
    assert.equal(loadCurrentSignals('demo', now + 2000)[0].status, 'DISQUALIFIED');
    assert.equal(loadSignalHistory('demo', sample.mint).length, 2);
    assert.equal(loadCurrentSignals('demo', unsafe.expiresAt + 1).length, 0);
  } finally {
    globalThis.localStorage = prior;
    dom.window.close();
  }
});
