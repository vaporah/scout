import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { assessTokens } from '../dist/src/analysis.js';
import { createRiskOverlay } from '../dist/src/riskOverlay.js';
import { defaults } from '../dist/src/settings.js';
import { fetchTokens } from '../dist/src/provider.js';

const mint = '11111111111111111111111111111111';

async function farmerAssessment() {
  const now = Date.now();
  const [sample] = await fetchTokens('demo', now);
  return assessTokens([{
    ...sample, mint, provider: 'Verified fixture',
    developer: {
      creator: 'creator11111111111111111111111111111', priorLaunches: 12, rapidFailures: 6, linkedSales: 0,
      source: 'verified', note: 'verified fixture',
      farmerEvidence: {
        linkedWallets: ['w11111111111111111111111111111111', 'w21111111111111111111111111111111', 'w31111111111111111111111111111111'],
        fundingTransactions: ['f11111111111111111111111111111111'],
        distributionTransactions: ['d11111111111111111111111111111111'],
        coordinatedSaleTransactions: ['s11111111111111111111111111111111', 's21111111111111111111111111111111']
      }
    }
  }], defaults, now)[0];
}

test('risk overlay shows a red FARMER DEV warning with safe explorer links and dismisses per token', async () => {
  const dom = new JSDOM('<body></body>', { url: `https://gmgn.ai/sol/token/${mint}` });
  const a = await farmerAssessment();
  assert.equal(a.farmer, true);
  const overlay = createRiskOverlay({ document: dom.window.document });
  try {
    overlay.update(a, defaults);
    const panel = dom.window.document.querySelector('.scout-risk');
    assert.ok(panel);
    assert.equal(panel.classList.contains('is-visible'), true);
    assert.equal(panel.dataset.scoutSeverity, 'red');
    assert.equal(panel.querySelector('.scout-risk-category')?.textContent, 'FARMER DEV');
    assert.match(panel.querySelector('.scout-risk-summary')?.textContent ?? '', /coordinated/i);

    // The verdict badge is the Scout mascot, never a text glyph.
    const badge = panel.querySelector('.scout-risk-icon');
    assert.equal(panel.querySelector('.scout-risk-head')?.firstElementChild, badge);
    assert.equal(badge?.querySelector('img')?.getAttribute('src'), 'scout-raccoon-logo.png');
    assert.equal(badge?.textContent, '');

    // Links are real explorer URLs; no invented transaction hashes or HTML.
    const links = [...panel.querySelectorAll('.scout-risk-link')].map(anchor => anchor.getAttribute('href'));
    assert.ok(links.some(href => href?.includes(mint)));
    assert.ok(links.every(href => href?.startsWith('https://')));

    // Dismiss hides the panel for this exact token only.
    panel.querySelector('[data-scout-action="dismiss"]').click();
    assert.equal(panel.classList.contains('is-visible'), false);
    overlay.update(a, defaults);
    assert.equal(panel.classList.contains('is-visible'), false);
  } finally { overlay.destroy(); dom.window.close(); }
});

test('risk overlay shows a green popup with market and coin-history details when nothing is flagged', async () => {
  const dom = new JSDOM('<body></body>', { url: `https://gmgn.ai/sol/token/${mint}` });
  const now = Date.now();
  const other = '22222222222222222222222222222222';
  const [sample] = await fetchTokens('demo', now);
  const [clean] = assessTokens([{
    ...sample, mint, provider: 'Verified fixture', dexName: 'raydium', quoteSymbol: 'SOL',
    developer: { creator: 'creator11111111111111111111111111111', priorLaunches: 2, rapidFailures: 0, linkedSales: 0, source: 'verified', note: '' }
  }], defaults, now);
  const overlay = createRiskOverlay({ document: dom.window.document });
  try {
    overlay.update(clean, defaults, null, {
      ath: { priceUsd: 0.002, at: now - 3_600_000, source: 'GeckoTerminal daily high' },
      observedHigh: { priceUsd: 0.0015, marketCapUsd: 50000, at: now - 60_000 },
      similar: [{ mint: other, symbol: 'FINCH', name: 'Orbit Finch', firstSeenAt: now - 7_200_000 }]
    });
    const panel = dom.window.document.querySelector('.scout-risk');
    assert.ok(panel);
    assert.equal(panel.dataset.scoutSeverity, 'green');
    assert.equal(panel.querySelector('.scout-risk-category')?.textContent, 'GOOD DEV');
    assert.equal(panel.querySelector('.scout-risk-icon img')?.getAttribute('src'), 'scout-raccoon-logo.png');
    const text = panel.textContent ?? '';
    assert.match(text, /Market & pool/);
    assert.match(text, /raydium · quoted in SOL/);
    assert.match(text, /All-time high/);
    assert.match(text, /Copycat\/vampire \(1\)/);
    assert.ok([...panel.querySelectorAll('.scout-risk-link')].some(a => a.getAttribute('href')?.includes(other)));

    // The Dev / Volume / Vamp verdicts are always shown.
    const verdicts = [...panel.querySelectorAll('.scout-risk-verdict')].map(node => node.textContent ?? '');
    assert.ok(verdicts.some(value => /Dev/.test(value) && /GOOD DEV/.test(value)), 'dev verdict');
    assert.ok(verdicts.some(value => /Volume/.test(value) && /(HIGH|MODERATE|LOW|UNKNOWN)/.test(value)), 'volume verdict');
    assert.ok(verdicts.some(value => /Vamp/.test(value) && /(copy|copies)/.test(value)), 'vamp verdict names the copy count');

    overlay.update(null, defaults);
    assert.equal(panel.classList.contains('is-visible'), false);
  } finally { overlay.destroy(); dom.window.close(); }
});

test('the token popup always answers the vampire question, even with no copies', async () => {
  const dom = new JSDOM('<body></body>', { url: `https://axiom.trade/t/${mint}` });
  const a = await farmerAssessment();
  const overlay = createRiskOverlay({ document: dom.window.document });
  const emptyView = { ath: null, observedHigh: null, similar: [], feedChecked: true };
  try {
    overlay.update(a, defaults, null, emptyView);
    let panel = dom.window.document.querySelector('.scout-risk');
    const verdicts = [...panel.querySelectorAll('.scout-risk-verdict')].map(node => node.textContent ?? '');
    assert.ok(verdicts.some(value => /Vamp/.test(value) && /no copies/.test(value)), 'the chip says none were found');
    assert.match(panel.textContent ?? '', /Copycat\/vampireNone found/);
    assert.match(panel.textContent ?? '', /Vampire checkNo other Solana pool uses this ticker/);

    // Without the feed lookup the popup must not imply a check it did not run.
    overlay.update(a, defaults, null, { ...emptyView, feedChecked: false });
    panel = dom.window.document.querySelector('.scout-risk');
    assert.match(panel.textContent ?? '', /Vampire checkScout has not seen another coin with this name yet/);
    assert.doesNotMatch(panel.textContent ?? '', /No other Solana pool/);

    // A feed-sourced copy is labelled as a ticker match rather than an observed coin.
    overlay.update(a, defaults, null, {
      ath: null, observedHigh: null, feedChecked: true,
      similar: [{ mint: '44444444444444444444444444444444', symbol: 'COPY', name: 'Copy Coin', firstSeenAt: Date.now(), source: 'feed' }]
    });
    panel = dom.window.document.querySelector('.scout-risk');
    assert.match(panel.textContent ?? '', /Copycat\/vampire \(1\)/);
    assert.match(panel.textContent ?? '', /feed ticker match/);
    assert.ok([...panel.querySelectorAll('.scout-risk-link')].some(anchor => anchor.getAttribute('href')?.includes('4444')));
  } finally { overlay.destroy(); dom.window.close(); }
});

test('an unchanged refresh keeps the popup DOM and remembered short/collapsed state', async () => {
  const dom = new JSDOM('<body></body>', { url: `https://gmgn.ai/sol/token/${mint}` });
  const a = await farmerAssessment();
  const overlay = createRiskOverlay({ document: dom.window.document });
  try {
    overlay.update(a, defaults);
    const panel = dom.window.document.querySelector('.scout-risk');
    const category = panel.querySelector('.scout-risk-category');
    assert.match(panel.textContent ?? '', /Market & pool/);

    // A refresh that produces the same facts must not rebuild the popup.
    overlay.update(a, defaults);
    assert.equal(panel.querySelector('.scout-risk-category'), category);

    panel.querySelector('[data-scout-action="collapse"]').click();
    assert.equal(panel.classList.contains('is-collapsed'), true);
    overlay.update(a, defaults);
    assert.equal(panel.classList.contains('is-collapsed'), true, 'a refresh must not expand the popup again');

    panel.querySelector('[data-scout-action="collapse"]').click();
    panel.querySelector('[data-scout-action="shorten"]').click();
    assert.doesNotMatch(panel.textContent ?? '', /Market & pool|Token checks/, 'the bulky blocks do hide');
    assert.match(panel.textContent ?? '', /Market, checks and history hidden/);
    assert.match(panel.textContent ?? '', /FARMER DEV/);
    // Holder data is the exception: it stays put in every mode.
    assert.ok(panel.querySelector('.scout-risk-holders'), 'the holder breakdown survives hide-details mode');
    assert.match(panel.textContent ?? '', /Dev \/ creator holding/);

    panel.querySelector('[data-scout-action="shorten"]').click();
    assert.match(panel.textContent ?? '', /Market & pool/);
  } finally { overlay.destroy(); dom.window.close(); }
});

test('risk overlay shows the host page developer badge when no warning is flagged', () => {
  const dom = new JSDOM('<body></body>', { url: `https://gmgn.ai/sol/token/${mint}` });
  const overlay = createRiskOverlay({ document: dom.window.document });
  try {
    overlay.update(null, defaults, { classification: 'PROVEN DEV', tone: 'green', details: ['High contributor: 1 dev token over $2K'] });
    const panel = dom.window.document.querySelector('.scout-risk');
    assert.ok(panel);
    assert.equal(panel.dataset.scoutSeverity, 'green');
    assert.equal(panel.querySelector('.scout-risk-category')?.textContent, 'PROVEN DEV');
    assert.match(panel.textContent ?? '', /High contributor/);
  } finally { overlay.destroy(); dom.window.close(); }
});

test('the popup lists the top holders and says what the developer still holds', async () => {
  const dom = new JSDOM('<body></body>', { url: `https://gmgn.ai/sol/token/${mint}` });
  const a = await farmerAssessment();
  const creator = 'creator11111111111111111111111111111';
  const wallets = [creator, 'h2'.repeat(16), 'h3'.repeat(16)];
  const flagged = {
    ...a,
    status: 'WATCH',
    critical: [],
    token: {
      ...a.token,
      holderCount: 1427,
      holders: [
        { wallet: wallets[1], pct: 21.5, type: 'wallet' },
        { wallet: wallets[0], pct: 6.25, type: 'wallet' },
        { wallet: wallets[2], pct: 2.5, type: 'wallet' }
      ]
    }
  };
  const overlay = createRiskOverlay({ document: dom.window.document });
  try {
    overlay.update(flagged, defaults);
    const panel = dom.window.document.querySelector('.scout-risk');
    const holders = panel.querySelector('.scout-risk-holders');
    assert.ok(holders, 'a holder breakdown is rendered');
    assert.equal(holders.querySelectorAll('.scout-risk-holder').length, 3);
    assert.deepEqual([...holders.querySelectorAll('.scout-risk-holder-pct')].map(n => n.textContent), ['21.50%', '6.25%', '2.50%'], 'largest first');
    // Bars are scaled to the largest holder so the ranking is readable.
    const widths = [...holders.querySelectorAll('.scout-risk-holder-fill')].map(n => n.style.width);
    assert.deepEqual(widths, ['100%', '29%', '12%']);

    const text = panel.textContent ?? '';
    assert.match(text, /Holders/);
    assert.match(text, /1,427/, 'the reported holder count');
    assert.match(text, /Top 3 hold/);
    assert.match(text, /30\.3%/, 'the combined share of the listed holders');
    assert.match(text, /Dev \/ creator holding/);
    assert.match(text, /6\.25% \u00b7 wallet #2/, 'the dev holding names the rank');
    assert.match(text, /One wallet holds 21\.5%/, 'a dominant wallet is called out');

    // Every holder links to its own account page, never to the token.
    const links = [...holders.querySelectorAll('.scout-risk-holder-wallet')];
    assert.equal(links.length, 3);
    assert.deepEqual(
      links.map(anchor => anchor.getAttribute('href')),
      [`https://solscan.io/account/${wallets[1]}`, `https://solscan.io/account/${wallets[0]}`, `https://solscan.io/account/${wallets[2]}`],
      'in the same largest-first order as the rows'
    );
    assert.ok(links.every(anchor => anchor.getAttribute('title')?.includes('% of total supply')), 'the exact share is in the tooltip');
  } finally { overlay.destroy(); dom.window.close(); }
});

test('a mint with no published breakdown still gets a Holders section that explains itself', async () => {
  const dom = new JSDOM('<body></body>', { url: `https://gmgn.ai/sol/token/${mint}` });
  const a = await farmerAssessment();
  const overlay = createRiskOverlay({ document: dom.window.document });
  const noBreakdown = token => ({ ...a, status: 'WATCH', critical: [], token: { ...a.token, holders: null, holderCount: null, developer: { ...a.token.developer, ...token } } });
  try {
    // An unknown creator and no holder list: the state the live feed is usually in.
    overlay.update(noBreakdown({ creator: null, source: 'unknown' }), defaults);
    const panel = dom.window.document.querySelector('.scout-risk');
    assert.equal(panel.querySelector('.scout-risk-holders'), null, 'no bars when there is nothing to rank');
    const text = panel.textContent ?? '';
    assert.match(text, /Holders/, 'the section is still there, so the change is visible');
    // The same rows as a full panel: a gap reads as a gap, not as a lesser popup.
    assert.match(text, /Top 10 hold/);
    assert.match(text, /Biggest wallet/);
    assert.equal((text.match(/Not published yet/g) ?? []).length, 3, 'each missing figure says so on its own row');
    assert.match(text, /Dev \/ creator holding/);
    assert.match(text, /Creator wallet is not identified for this token/);
    assert.match(text, /No holder breakdown has been published for this mint yet/, 'it says why, rather than showing nothing');

    // A known creator with no breakdown names the wallet instead of claiming a number.
    overlay.update(noBreakdown({ creator: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' }), defaults);
    assert.match(dom.window.document.querySelector('.scout-risk').textContent ?? '', /Creator wallet 9WzDXw\u2026tAWWM \u00b7 holdings not published/);
  } finally { overlay.destroy(); dom.window.close(); }
});

test('an account large enough to be a vault is labelled as an account, not a wallet', async () => {
  const dom = new JSDOM('<body></body>', { url: `https://axiom.trade/t/${mint}` });
  const a = await farmerAssessment();
  // A token minutes old: the bonding curve dominates, and calling that "one wallet
  // holds 99%" would be a false alarm rather than a finding.
  const curve = { ...a, status: 'WATCH', critical: [], token: { ...a.token, holders: [{ wallet: '1'.repeat(32), pct: 99.9, type: 'pool' }], holderCount: 21 } };
  const overlay = createRiskOverlay({ document: dom.window.document });
  try {
    overlay.update(curve, defaults);
    const text = dom.window.document.querySelector('.scout-risk').textContent ?? '';
    assert.match(text, /Largest account/);
    assert.doesNotMatch(text, /Biggest wallet/);
    assert.match(text, /usually the pool or bonding curve rather than a person/);
    assert.doesNotMatch(text, /One wallet holds/);
  } finally { overlay.destroy(); dom.window.close(); }
});

test('holder data is on the popup for every verdict, UNKNOWN DEV included', async () => {
  const dom = new JSDOM('<body></body>', { url: `https://axiom.trade/t/${mint}` });
  const a = await farmerAssessment();
  const wallets = ['1'.repeat(32), '2'.repeat(32), '3'.repeat(32)];
  // The state almost every fresh Axiom pair is in: the creator is unverified, but a
  // holder breakdown is still published.
  const token = {
    ...a.token,
    holders: wallets.map((wallet, index) => ({ wallet, pct: 18 - index * 5, type: 'wallet' })),
    holderCount: 640,
    developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: '' }
  };
  const overlay = createRiskOverlay({ document: dom.window.document });
  try {
    // The farmer/suspicious flags would take the red warning path, so this is a plain
    // unverified-creator coin: exactly the "UNKNOWN DEV" panel.
    overlay.update({ ...a, status: 'WATCH', critical: [], warnings: [], farmer: false, suspiciousConcentration: false, token }, defaults);
    const panel = dom.window.document.querySelector('.scout-risk');
    assert.equal(panel.querySelector('.scout-risk-category')?.textContent, 'UNKNOWN DEV', 'this is the unverified-creator verdict');
    assert.equal(panel.querySelectorAll('.scout-risk-holder').length, 3, 'the ranking is shown anyway');
    assert.match(panel.textContent ?? '', /640/, 'the holder count is shown anyway');
    assert.match(panel.textContent ?? '', /Creator wallet is not identified for this token/);
    assert.deepEqual(
      [...panel.querySelectorAll('.scout-risk-holder-pct')].map(node => node.textContent),
      ['18.00%', '13.00%', '8.00%']
    );

    // And it is the one block that survives the hide-details toggle.
    panel.querySelector('[data-scout-action="shorten"]').click();
    assert.equal(panel.querySelectorAll('.scout-risk-holder').length, 3, 'still there with details hidden');
    assert.doesNotMatch(panel.textContent ?? '', /Market & pool/);
  } finally { overlay.destroy(); dom.window.close(); }
});

test('the popup badge is the Scout mascot in a circle tinted by severity', () => {
  const dom = new JSDOM('<body></body>', { url: `https://gmgn.ai/sol/token/${mint}` });
  const overlay = createRiskOverlay({ document: dom.window.document });
  try {
    for (const tone of ['green', 'red', 'neutral']) {
      overlay.update(null, defaults, { classification: `${tone.toUpperCase()} DEV`, tone, details: [`${tone} fixture`] });
      const panel = dom.window.document.querySelector('.scout-risk');
      assert.equal(panel.dataset.scoutSeverity, tone, `${tone} severity reaches the panel, which drives the badge colour`);
      const badge = panel.querySelector('.scout-risk-icon');
      assert.ok(badge, `${tone} badge exists`);
      assert.equal(badge.textContent, '', `${tone} badge carries no text glyph`);
      assert.equal(badge.querySelector('img')?.getAttribute('src'), 'scout-raccoon-logo.png', `${tone} badge is the mascot`);
      assert.equal(badge.getAttribute('aria-hidden'), 'true', 'the badge is decorative; the category text carries the meaning');
    }
  } finally { overlay.destroy(); dom.window.close(); }
});
