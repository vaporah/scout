/**
 * Screenshot harness for the Chrome Web Store listing.
 *
 * Not part of the extension. It calls the real rendering code with illustrative data:
 *
 *   - `applyPulseSignals` (src/pulseRows.ts) colours the demo rows,
 *   - `createRiskOverlay` (src/riskOverlay.ts) renders the coin popup, including the
 *     verdict wording chosen by `warningFor` (src/riskWarning.ts),
 *   - `tokenTags` (src/categories.ts) supplies the platform chips.
 *
 * So the captured images are genuine renderer output for invented inputs, not a drawing.
 * The mint addresses are generated here and correspond to no real token.
 *
 * Build: npx esbuild scripts/store-shots/shot.ts --bundle --format=iife --outfile=scripts/store-shots/shot.js
 */
import { tokenTags } from '../../src/categories.js';
import type { TokenHistoryView } from '../../src/coinHistory.js';
import { applyPulseSignals, type PulseRow } from '../../src/pulseRows.js';
import { createRiskOverlay } from '../../src/riskOverlay.js';
import type { Analytics, Assessment, HolderQuality, Settings, Status, Token } from '../../src/types.js';

const NOW = Date.now();
const MINUTE = 60_000;

const settings: Settings = {
  refreshSeconds: 15,
  minLiquidityUsd: 25_000,
  maxSlippagePct: 8,
  tradeSizeUsd: 500,
  minScore: 65,
  maxAgeHours: 72,
  notifications: false,
  weights: { momentum: 0.2, liquidity: 0.2, developer: 0.2, price: 0.15, holders: 0.15, security: 0.1 }
};

/* ---------------------------------------------------------------- demo identities */

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Deterministic 43-character base58 string. Matches the mint pattern, matches no real token. */
function demoMint(seed: number): string {
  let out = '';
  let x = (seed * 7919 + 104729) % 2147483647;
  while (out.length < 43) {
    x = (x * 48271) % 2147483647;
    out += B58[(x >>> 3) % 58];
  }
  return out;
}

interface Demo {
  symbol: string;
  name: string;
  mint: string;
  price: number;
  liquidity: number;
  marketCap: number;
  volume5m: number;
  buys: number;
  sells: number;
  buyers: number;
  ageMinutes: number;
}

const demos: Demo[] = [
  { symbol: 'KETTLE', name: 'Kettle', mint: demoMint(11), price: 0.00412, liquidity: 96_400, marketCap: 2_940_000, volume5m: 241_800, buys: 61, sells: 22, buyers: 34, ageMinutes: 38 },
  { symbol: 'PARKWAY', name: 'Parkway', mint: demoMint(12), price: 0.0718, liquidity: 128_000, marketCap: 6_180_000, volume5m: 34_500, buys: 24, sells: 15, buyers: 9, ageMinutes: 96 },
  { symbol: 'TINFOIL', name: 'Tinfoil', mint: demoMint(13), price: 0.00221, liquidity: 41_200, marketCap: 884_000, volume5m: 18_900, buys: 31, sells: 9, buyers: 17, ageMinutes: 51 },
  { symbol: 'GRAVEL', name: 'Gravel', mint: demoMint(14), price: 0.00904, liquidity: 22_600, marketCap: 412_000, volume5m: 9_100, buys: 12, sells: 26, buyers: 7, ageMinutes: 143 },
  { symbol: 'MARIGOLD', name: 'Marigold', mint: demoMint(15), price: 0.00091, liquidity: 88_300, marketCap: 1_120_000, volume5m: 183_400, buys: 58, sells: 41, buyers: 29, ageMinutes: 21 },
  { symbol: 'LANTERN', name: 'Lantern', mint: demoMint(16), price: 0.0334, liquidity: 240_000, marketCap: 3_330_000, volume5m: 860, buys: 6, sells: 5, buyers: 4, ageMinutes: 310 },
  { symbol: 'SPINDLE', name: 'Spindle', mint: demoMint(17), price: 0.00018, liquidity: 9_400, marketCap: 96_000, volume5m: 2_100, buys: 9, sells: 14, buyers: 6, ageMinutes: 12 },
  { symbol: 'SPROCKET', name: 'Sprocket', mint: demoMint(18), price: 0.0126, liquidity: 74_100, marketCap: 1_420_000, volume5m: 26_400, buys: 22, sells: 17, buyers: 11, ageMinutes: 64 },
  { symbol: 'TUMBLER', name: 'Tumbler', mint: demoMint(19), price: 0.00587, liquidity: 152_000, marketCap: 4_060_000, volume5m: 61_900, buys: 38, sells: 19, buyers: 21, ageMinutes: 47 },
  { symbol: 'COPPER', name: 'Copper', mint: demoMint(20), price: 0.00044, liquidity: 31_800, marketCap: 512_000, volume5m: 5_600, buys: 11, sells: 10, buyers: 8, ageMinutes: 27 },
  { symbol: 'HALYARD', name: 'Halyard', mint: demoMint(21), price: 0.0209, liquidity: 68_500, marketCap: 2_210_000, volume5m: 21_300, buys: 19, sells: 33, buyers: 12, ageMinutes: 118 }
];

function buildAnalytics(d: Demo, over: Partial<Analytics> = {}): Analytics {
  return {
    volume30s: Math.round(d.volume5m / 10), volume1m: Math.round(d.volume5m / 5), volume5m: d.volume5m, volume15m: d.volume5m * 2.6,
    buys5m: d.buys, sells5m: d.sells, buyVolume5m: null, sellVolume5m: null,
    buyers5m: d.buyers, sellers5m: Math.max(1, Math.round(d.buyers * 0.7)), buyerGrowth: null,
    volumeAcceleration: null, repeatBuyers: 0, netPressure: null, suspiciousConcentration: false,
    ...over
  };
}

function buildToken(d: Demo, over: Partial<Token> = {}): Token {
  return {
    mint: d.mint, chain: 'solana', name: d.name, symbol: d.symbol, stage: 'migrated',
    launchedAt: NOW - d.ageMinutes * MINUTE, observedAt: NOW,
    poolAddresses: [demoMint(d.mint.length + 500)],
    priceUsd: d.price, marketCapUsd: d.marketCap, fdvUsd: Math.round(d.marketCap * 1.16),
    liquidityUsd: d.liquidity, liquidityChangePct: 6.2, priceChange5mPct: 4.8, imageUrl: null,
    trades: [], holders: null, holderCount: 1284,
    top10HoldPct: null, holderBands: null, holderQuality: null, developerHoldingPct: 4.2,
    developer: { creator: demoMint(d.mint.length + 900), priorLaunches: 3, rapidFailures: 0, linkedSales: 0, source: 'verified', note: '' },
    mintAuthority: false, freezeAuthority: false, transferRestriction: false,
    migrationProgressPct: null, provider: 'DexScreener', dexName: 'Raydium', quoteSymbol: 'SOL',
    marketSnapshot: { volume5m: d.volume5m, volume15m: d.volume5m * 2.6, buys5m: d.buys, sells5m: d.sells, buyers5m: d.buyers, sellers5m: Math.max(1, Math.round(d.buyers * 0.7)) },
    ...over
  };
}

function buildAssessment(token: Token, analytics: Analytics, over: Partial<Assessment> = {}): Assessment {
  return {
    token, analytics, score: 74, status: 'WATCH', confidence: 'medium',
    expiresAt: NOW + 5 * MINUTE, dataCompletenessPct: 82,
    components: { momentum: 68, liquidity: 71, developer: 74, price: 66, holders: 59, security: 90 },
    positives: ['Liquidity held while volume rose', 'Buy count leads sell count on the 5m window', 'Creator has shipped before without a rapid failure'],
    warnings: ['Top 10 wallets hold a large share of supply'],
    missing: ['Creator holding is not published by the feed'],
    critical: [], entryConditions: [{ label: 'Minimum liquidity met', met: true }], invalidation: [],
    slippagePct: 2.4, concentrationPct: 38.6, farmer: null,
    ...over
  };
}

function buildHolders(): NonNullable<Token['holders']> {
  return [
    { wallet: demoMint(301), pct: 14.82, type: 'pool', tag: 'Raydium AMM', locked: true },
    { wallet: demoMint(302), pct: 6.41, type: 'wallet', tag: null },
    { wallet: demoMint(303), pct: 5.13, type: 'wallet', tag: null },
    { wallet: demoMint(304), pct: 4.27, type: 'wallet', tag: null },
    { wallet: demoMint(305), pct: 3.08, type: 'burn', tag: 'Burn address' },
    { wallet: demoMint(306), pct: 2.66, type: 'wallet', tag: null },
    { wallet: demoMint(307), pct: 2.11, type: 'wallet', tag: null }
  ];
}

const quality: HolderQuality = { devLaunches: 3, bundlerPct: 6.4, sniperPct: 3.1, botDegenPct: 11.2, freshWalletPct: 18.6 };

function buildHistory(): TokenHistoryView {
  return {
    ath: { priceUsd: 0.0942, at: NOW - 26 * 60 * MINUTE, source: 'GeckoTerminal' },
    observedHigh: { priceUsd: 0.0521, marketCapUsd: 4_120_000, at: NOW - 5 * 60 * MINUTE },
    similar: [
      { mint: demoMint(701), symbol: 'KETTLE', name: 'Kettle', firstSeenAt: NOW - 19 * 60 * MINUTE, source: 'observed' },
      { mint: demoMint(702), symbol: 'KETTLE', name: 'Kettle Inu', firstSeenAt: NOW - 3 * 60 * MINUTE, source: 'feed' }
    ],
    feedChecked: true
  };
}

/* ------------------------------------------------------------------- shot: rows */

function badgeKind(row: HTMLElement): 'green' | 'amber' | 'red' | 'gray' | 'run' {
  const c = row.classList;
  if (c.contains('scout-pulse-run')) return 'run';
  if (c.contains('scout-pulse-green')) return 'green';
  if (c.contains('scout-pulse-amber')) return 'amber';
  if (c.contains('scout-pulse-red')) return 'red';
  return 'gray';
}

function renderRows(): void {
  const body = document.getElementById('rows');
  if (!body) return;
  const statuses: Status[] = [
    'TOP CANDIDATE', 'TOP CANDIDATE', 'WATCH', 'HIGH RISK', 'UNKNOWN / INCOMPLETE', 'UNKNOWN / INCOMPLETE', 'DISQUALIFIED',
    'WATCH', 'TOP CANDIDATE', 'UNKNOWN / INCOMPLETE', 'WAIT FOR CONFIRMATION'
  ];
  const scores = [81, 71, 68, 24, 41, 33, 12, 66, 77, 38, 52];
  const critical: string[][] = [[], [], [], ['Liquidity pulled by the deploying wallet'], [], [], ['Trading is disabled by the token contract'], [], [], [], []];

  const rows: PulseRow[] = [];
  const assessments: Assessment[] = [];

  demos.forEach((d, index) => {
    const tr = document.createElement('tr');
    tr.className = 'scout-pulse-row';
    tr.innerHTML = `
      <td class="left mock-rank">${index + 1}</td>
      <td class="left"><div class="mock-name"><span class="mock-sym">${d.symbol}</span><span class="mock-age">${d.ageMinutes}m</span></div>
        <div class="mock-full">${d.mint}</div></td>
      <td>$${d.price < 0.01 ? d.price.toPrecision(3) : d.price.toFixed(4)}</td>
      <td class="${index === 3 || index === 6 ? 'mock-down' : 'mock-up'}">${index === 3 || index === 6 ? '-' : '+'}${(3 + index * 1.7).toFixed(1)}%</td>
      <td class="mock-dim">$${d.liquidity.toLocaleString('en-US')}</td>
      <td class="mock-dim">$${d.marketCap.toLocaleString('en-US')}</td>`;
    body.append(tr);

    const token = buildToken(d, { holderQuality: quality, developerHoldingPct: 4.2 });
    const analytics = buildAnalytics(d, { suspiciousConcentration: index === 3 });
    const assessment = buildAssessment(token, analytics, {
      score: scores[index] ?? 50,
      status: statuses[index] ?? 'WATCH',
      critical: critical[index] ?? [],
      farmer: null
    });
    rows.push({ element: tr, mint: d.mint });
    assessments.push(assessment);
  });

  applyPulseSignals(rows, assessments, settings, NOW);

  // The badge rail and platform chips are added by the overlay itself; the harness
  // mirrors that markup, deriving the colour from the class the real code just applied.
  rows.forEach((row, index) => {
    const demo = demos[index];
    const assessment = assessments[index];
    if (!demo || !assessment) return;
    const kind = badgeKind(row.element);
    const badge = document.createElement('span');
    badge.className = `scout-pulse-badge scout-pulse-badge--${kind}`;
    badge.textContent = kind === 'run' ? 'SCOUT \u00b7 RUNNING' : `SCOUT ${Math.round(assessment.score)}`;
    badge.title = `${assessment.status} \u00b7 Score ${Math.round(assessment.score)}/100`;
    row.element.append(badge);

    const tags = tokenTags(assessment.token);
    if (tags.length) {
      const wrap = document.createElement('div');
      wrap.className = 'scout-pulse-tags';
      for (const tag of tags.slice(0, 3)) {
        const chip = document.createElement('span');
        chip.className = 'scout-pulse-tag';
        chip.textContent = tag.label;
        chip.style.setProperty('--scout-tag', tag.color);
        wrap.append(chip);
      }
      row.element.append(wrap);
    }
  });
}

/* ------------------------------------------------------------------ shot: popup */

function renderPopup(mode: 'popup' | 'history'): void {
  const demo = mode === 'history' ? demos[1] : demos[0];
  if (!demo) return;

  // The panel is drawn over the list it was launched from, dimmed, so the capture shows
  // the real thing in a real context rather than floating on an empty background.
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  document.body.append(scrim);

  // The second variant is a coin nothing is wrong with: no warning fires, so the panel
  // falls through to the developer verdict, and it is scrolled to the token checks and
  // the copycat history rather than repeating the holder block.
  const clean = mode === 'history';
  const token = buildToken(demo, {
    holders: buildHolders(),
    holderQuality: quality,
    developerHoldingPct: 4.2,
    liquidityUsd: clean ? 128_000 : 14_200,
    liquidityChangePct: clean ? 8.4 : -42.5,
    marketCapUsd: clean ? 6_180_000 : 412_000
  });
  const analytics = buildAnalytics(demo, { volume5m: clean ? 34_500 : 18_900 });
  const assessment = buildAssessment(token, analytics, {
    score: clean ? 71 : 46,
    status: clean ? 'WATCH' : 'WAIT FOR CONFIRMATION',
    confidence: 'medium',
    dataCompletenessPct: 82,
    slippagePct: clean ? 1.9 : 11.8,
    concentrationPct: 38.6,
    warnings: clean ? [] : ['Liquidity fell more than 30% in the last 5 minutes', 'Top 10 wallets hold 38.6% of supply']
  });

  const overlay = createRiskOverlay();
  overlay.update(assessment, settings, null, buildHistory());

  if (clean) {
    requestAnimationFrame(() => {
      const body = document.querySelector<HTMLElement>('.scout-risk-body');
      if (body) body.scrollTop = body.scrollHeight;
    });
  }
}

/* ---------------------------------------------------------------------- driver */

const shot = new URLSearchParams(location.search).get('shot') ?? 'rows';
document.body.dataset.shot = shot;
renderRows();
if (shot === 'popup') renderPopup('popup');
if (shot === 'history') renderPopup('history');
