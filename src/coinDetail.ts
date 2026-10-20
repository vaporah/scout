import { escapeHtml as e, money, pct, safeImageUrl, statusClass } from './ui.js';
import { avatarStyle, devChip, poolAgeLabel, stageLabel } from './tokenCard.js';
import { solFlowReading, solPoolReading } from './poolLiquidity.js';
import { trapCheck } from './trapCheck.js';
import type { Assessment, Settings, SignalRecord } from './types.js';

/**
 * The coin detail card shown when a coin is clicked, in the popup and on the
 * dashboard. One renderer keeps both surfaces identical: identity, verdict, the
 * live metric grid, entry conditions, evidence and the source line.
 */
export interface CoinDetailOptions {
  mode: 'live' | 'demo';
  /** Kept for parity with the row renderer; the card itself is settings-independent. */
  settings?: Settings;
  /** Popup view: keep the verdict, metrics, conditions and evidence, skip the long tables. */
  compact?: boolean;
  /** Recent status changes for the dashboard history section. */
  history?: SignalRecord[];
}

function list(items: string[], empty: string): string {
  return items.length ? `<ul>${items.map(item => `<li>${e(item)}</li>`).join('')}</ul>` : `<p class="muted">${empty}</p>`;
}

function metric(label: string, value: string): string {
  return `<div><small>${e(label)}</small><strong>${e(value)}</strong></div>`;
}

/** Identify and inspect one coin. All text is escaped; only Scout's own classes are emitted. */
export function coinDetail(a: Assessment, options: CoinDetailOptions): string {
  const t = a.token;
  const compact = options.compact === true;
  const buySell = t.marketSnapshot
    ? metric('Buy / sell transactions', `${a.analytics.buys5m} / ${a.analytics.sells5m}`)
    : metric('Buy / sell volume', `${money(a.analytics.buyVolume5m)} / ${money(a.analytics.sellVolume5m)}`);
  const history = (options.history ?? []).slice(-5).reverse();
  const logo = safeImageUrl(t.imageUrl);
  const image = logo ? `<img class="coin-img" src="${e(logo)}" alt="" decoding="async" referrerpolicy="no-referrer">` : '';
  const trap = trapCheck(a);
  const checkpoint = t.launchCheckpoint?.capturedAt
    ? t.launchCheckpoint.priceChangePct !== null ? `${t.launchCheckpoint.priceChangePct >= 0 ? '+' : ''}${t.launchCheckpoint.priceChangePct.toFixed(1)}%` : 'Unknown'
    : 'Watching';

  return `<div class="detail-title"><span class="coin large" style="${avatarStyle(t.mint)}" aria-hidden="true">${e(t.symbol.slice(0, 1) || '?')}${image}</span><div><h2>${e(t.name)}</h2><p>${e(t.symbol)} · ${e(stageLabel(t.stage))} · ${e(poolAgeLabel(a, options.mode))}<button class="copy-ca" type="button" data-copy-mint="${e(t.mint)}" title="Copy contract address" aria-label="Copy contract address">Copy CA</button></p></div></div>
    <div class="verdict"><div><span class="badge ${statusClass(a.status)}">${e(a.status)}</span>${devChip(a)}<span class="confidence">${e(a.confidence)} confidence · ${a.dataCompletenessPct}% data · expires ${e(new Date(a.expiresAt).toLocaleTimeString())}</span></div><strong>${a.score}<small>/100</small></strong></div>
    <div class="metrics">${metric('Trap check', trap.verdict)}${metric('60s price', checkpoint)}${metric('Market cap', money(t.marketCapUsd))}${metric('Liquidity', money(t.liquidityUsd))}${metric('SOL in pool', solPoolReading(t).short)}${metric('5m SOL flow', solFlowReading(t).short)}${metric('5m volume', money(a.analytics.volume5m))}${metric('5m price', pct(t.priceChange5mPct))}${buySell}${metric('Estimated impact', pct(a.slippagePct))}</div>
    <div class="detail-section"><h3>Entry conditions</h3><div class="conditions">${a.entryConditions.map(condition => `<div><span class="${condition.met ? 'yes' : 'no'}">${condition.met ? '✓' : '✕'}</span>${e(condition.label)}</div>`).join('')}</div></div>
    <div class="detail-section"><h3>Supporting evidence</h3>${list(a.positives, 'No supporting signals in the current observation.')}</div>
    <div class="detail-section"><h3>Warnings and critical risks</h3>${list([...a.critical, ...a.warnings], 'No warnings in the current observation.')}</div>
    ${compact ? '' : `<div class="detail-section"><h3>Missing evidence</h3>${list(a.missing, 'No tracked evidence is missing.')}</div>
    <div class="detail-section"><h3>Score breakdown</h3><div class="components">${Object.entries(a.components).map(([name, value]) => `<div><span>${e(name)}</span><strong>${value}</strong></div>`).join('')}</div></div>
    <div class="detail-section"><h3>Signal history</h3>${history.length ? `<ul>${history.map(record => `<li>${e(new Date(record.at).toLocaleString())}: ${e(record.status)} (${record.score}/100)</li>`).join('')}</ul>` : '<p class="muted">No status changes recorded yet.</p>'}</div>`}
    <div class="source">Source: ${e(t.provider)} · ${e(t.developer.note)}<br>Mint: <code>${e(t.mint)}</code>${t.sourceUrl ? `<br><a href="${e(t.sourceUrl)}" target="_blank" rel="noopener noreferrer">View source pool ↗</a>` : ''}${options.mode === 'live' ? `<br><a href="https://axiom.trade/t/${e(t.mint)}?chain=sol" target="_blank" rel="noopener noreferrer">Open token on Axiom ↗</a>` : ''}</div>`;
}
