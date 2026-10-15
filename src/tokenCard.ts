import { age, escapeHtml as e, money, safeImageUrl, signalClass, statusClass, statusShort } from './ui.js';
import { tokenTags } from './categories.js';
import { devStatus } from './developerReputation.js';
import type { Assessment, Settings } from './types.js';

/**
 * Shared coin-row presentation for the popup and the dashboard. Rows read like an
 * Axiom Pulse card: a tinted avatar, ticker, name, live chips and a Scout score.
 * Every value comes from the assessment; a fact that is unknown is simply omitted
 * rather than shown as a placeholder, and no third-party text is treated as markup.
 */

export type ChipTone = 'plain' | 'up' | 'down' | 'warn';

export interface StatChip {
  label: string;
  value: string;
  tone: ChipTone;
}

export interface CoinRowOptions {
  settings: Settings;
  /** Live feed or simulated demo, which changes how pool age is described. */
  mode: 'live' | 'demo';
  active?: boolean;
  pinned?: boolean;
}

/** Deterministic tint per coin, so each token keeps its own avatar colour. */
export function coinHue(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index++) hash = (hash * 31 + seed.charCodeAt(index)) % 360;
  return hash;
}

export function avatarStyle(seed: string): string {
  return `--coin-hue:${coinHue(seed)}`;
}

export function poolAgeLabel(a: Assessment, mode: 'live' | 'demo'): string {
  const launchedAt = a.token.launchedAt;
  if (launchedAt === null) return 'age unknown';
  const elapsed = age(Date.now() - launchedAt);
  return mode === 'live' ? `${elapsed} old` : `${elapsed} old · demo`;
}

export function stageLabel(stage: Assessment['token']['stage']): string {
  return stage === 'bonding' ? 'Final stretch' : stage === 'new' ? 'New pairs' : stage === 'migrated' ? 'Migrated' : 'Stage unknown';
}

function signedChange(a: Assessment): StatChip | null {
  const value = a.token.priceChange5mPct;
  if (value === null || !Number.isFinite(value)) return null;
  return { label: '5m', value: `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`, tone: value >= 0 ? 'up' : 'down' };
}

function liquidityChange(a: Assessment): StatChip | null {
  const value = a.token.liquidityChangePct;
  if (value === null || !Number.isFinite(value)) return null;
  return { label: 'Liq chg', value: `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`, tone: value >= 0 ? 'up' : 'down' };
}

function concentration(a: Assessment): StatChip | null {
  if (a.concentrationPct === null) return null;
  return { label: 'Top 10', value: `${a.concentrationPct.toFixed(0)}%`, tone: a.concentrationPct >= 50 ? 'warn' : 'plain' };
}

function turnover(a: Assessment, mode: 'live' | 'demo'): StatChip | null {
  const volume = a.analytics.volume5m;
  const liquidity = a.token.liquidityUsd;
  if (mode === 'demo' || liquidity === null || liquidity <= 0 || volume === null) return null;
  const multiple = volume / liquidity;
  return { label: 'Turnover', value: `${multiple.toFixed(1)}×`, tone: multiple >= 1 ? 'warn' : 'plain' };
}

function buyers(a: Assessment): StatChip | null {
  const { buyers5m, sellers5m } = a.analytics;
  if (buyers5m === null || sellers5m === null) return null;
  return { label: 'Buy / sell', value: `${buyers5m} / ${sellers5m}`, tone: buyers5m >= sellers5m ? 'up' : 'down' };
}

/** The live chips shown along the bottom of a coin row, most useful first. */
export function statChips(a: Assessment, mode: 'live' | 'demo'): StatChip[] {
  const chips: (StatChip | null)[] = [
    signedChange(a),
    liquidityChange(a),
    concentration(a),
    buyers(a),
    turnover(a, mode),
    { label: 'MC', value: money(a.token.marketCapUsd), tone: 'plain' },
    { label: 'Liq', value: money(a.token.liquidityUsd), tone: 'plain' },
    { label: 'Vol 5m', value: money(a.analytics.volume5m), tone: 'plain' }
  ];
  return chips.filter((chip): chip is StatChip => chip !== null && chip.value !== 'Unknown').slice(0, 6);
}

function chipHtml(chip: StatChip): string {
  return `<span class="stat-chip stat-chip--${chip.tone}"><small>${e(chip.label)}</small><b>${e(chip.value)}</b></span>`;
}

function metaChip(text: string): string {
  return `<span class="meta-chip">${e(text)}</span>`;
}

/**
 * The developer verdict, the same one the Axiom panels show: GOOD DEV, RISKY DEV or
 * UNKNOWN DEV. It is always rendered, because "we could not verify this creator" is
 * information, not a missing value.
 */
export function devChip(a: Assessment): string {
  const dev = devStatus(a.token);
  return `<span class="meta-chip meta-chip--dev meta-chip--dev-${dev.tone}" title="${e(dev.reasons[0] ?? '')}">${e(dev.label)}</span>`;
}

/** The developer verdict as a chip for a metric row (popup rows). */
function devStatChip(a: Assessment): string {
  const dev = devStatus(a.token);
  return `<span class="stat-chip stat-chip--${dev.tone === 'green' ? 'up' : dev.tone === 'orange' ? 'warn' : 'plain'}" title="${e(dev.reasons[0] ?? '')}"><small>Dev</small><b>${e(dev.label.replace(/ DEV$/, ''))}</b></span>`;
}

/**
 * The coin logo when the feed publishes one, over the deterministic tinted initial
 * so a missing or broken image still leaves a readable avatar.
 */
function avatar(symbol: string, seed: string, extraClass: string, imageUrl: string | null): string {
  const logo = safeImageUrl(imageUrl);
  // Logos load eagerly: a background tab or companion window would never fetch a
  // lazy image, and the tinted initial is already behind it as a fallback.
  const image = logo ? `<img class="coin-img" src="${e(logo)}" alt="" decoding="async" referrerpolicy="no-referrer">` : '';
  return `<span class="coin ${extraClass}" style="${avatarStyle(seed)}" aria-hidden="true">${e(symbol.slice(0, 1) || '?')}${image}</span>`;
}

/** Copy-contract-address control shared by every coin layout. */
function copyButton(mint: string, label: string): string {
  return `<button class="copy-ca" type="button" data-copy-mint="${e(mint)}" title="Copy contract address" aria-label="Copy contract address">${e(label)}</button>`;
}

/**
 * One compact coin row for the popup list. The wrapper is a plain div so the list
 * keeps its simple grid, and the row stays a plain summary of the observation.
 */
export function popupCoinRow(a: Assessment, options: CoinRowOptions): string {
  const t = a.token;
  const chips = statChips(a, options.mode).slice(0, 3).map(chipHtml).join('');
  return `<div class="coin-row ${signalClass(a, options.settings)}" data-mint="${e(t.mint)}">${avatar(t.symbol, t.mint, 'coin-small', t.imageUrl)}<div class="coin-body"><div class="coin-line"><strong title="${e(t.name)}">${e(t.symbol)}</strong>${copyButton(t.mint, 'CA')}<span class="coin-sub">${e(poolAgeLabel(a, options.mode))}</span></div><div class="coin-chips">${devStatChip(a)}${chips}</div></div><div class="coin-score"><strong>${a.score}</strong><span class="badge ${statusClass(a.status)}" title="${e(a.status)}">${e(statusShort(a.status))}</span></div></div>`;
}

/**
 * Full dashboard card: identity, live chips and the Scout score. It is a div with a
 * button role because it also contains the copy-address button, and a button may not
 * be nested inside another button.
 */
export function tokenCard(a: Assessment, options: CoinRowOptions): string {
  const t = a.token;
  const chips = statChips(a, options.mode).map(chipHtml).join('');
  const platform = tokenTags(t).find(tag => tag.kind === 'platform');
  const platformChip = platform ? `<span class="meta-chip meta-chip--platform" style="--chip:${e(platform.color)}">${e(platform.label)}</span>` : '';
  const meta = [poolAgeLabel(a, options.mode), stageLabel(t.stage), `${money(t.liquidityUsd)} liq.`].map(metaChip).join('');
  const pinned = options.pinned ? '<em class="pinned-label">PINNED</em>' : '';
  const label = `${t.name} (${t.symbol}) — Scout score ${a.score} of 100, ${a.status}`;
  return `<div class="token-card ${signalClass(a, options.settings)} ${options.active ? 'active' : ''}" data-mint="${e(t.mint)}" role="button" tabindex="0" aria-label="${e(label)}">${avatar(t.symbol, t.mint, '', t.imageUrl)}<div class="token-main"><div class="token-name"><strong>${e(t.name)}</strong><span>${e(t.symbol)}</span>${copyButton(t.mint, 'CA')}${pinned}</div><div class="token-meta">${platformChip}${devChip(a)}${meta}</div></div><div class="token-right"><strong>${a.score}<small>/100</small></strong><span class="badge ${statusClass(a.status)}" title="${e(a.status)}">${e(statusShort(a.status))}</span></div><div class="token-stats">${chips}</div></div>`;
}
