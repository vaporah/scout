import { attentionSignals, movementVerdict, volumeVerdict } from './attention.js';
import { tokenTags } from './categories.js';
import { devStatus } from './developerReputation.js';
import { narrativeTags } from './narrative.js';
import { solFlowReading, solPoolReading } from './poolLiquidity.js';
import { formatPulseLabels, stageLabel, type PulseLabels } from './pulseLabels.js';
import type { RowReadings } from './rowReadings.js';
import type { Assessment, Stage } from './types.js';
import { renderIfChanged } from './ui.js';

export type PulseTooltipState = 'scanning' | 'unknown' | 'assessed';

export interface PulseTooltipRowInfo {
  stage?: Stage;
  labels?: PulseLabels;
  /** Number of other coins Scout has seen with the same name/symbol. */
  similar?: number;
  observedHigh?: { priceUsd: number | null; marketCapUsd: number | null; at: number | null } | null;
  /** Live facts read straight off the Axiom card, shown when no assessment exists. */
  readings?: RowReadings | null;
  /** True when Scout already asked its providers about this row's mint. */
  attempted?: boolean;
  /** Seconds between automatic re-checks, used to explain the scan cadence. */
  intervalSeconds?: number;
  /** Short mode: keep the verdict and hide the detail sections below it. */
  compact?: boolean;
}

const money = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 1, notation: 'compact'
});

function usd(value: number | null | undefined): string {
  return value !== null && value !== undefined && Number.isFinite(value) ? money.format(value) : 'Unknown';
}

function age(observedAt: number | null | undefined, expiresAt: number | undefined, now: number): string {
  if (observedAt === null || observedAt === undefined || !Number.isFinite(observedAt) || observedAt > now + 60_000) return 'Unknown';
  const seconds = Math.max(0, Math.floor((now - observedAt) / 1000));
  const elapsed = seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : `${Math.floor(seconds / 3600)}h`;
  return `${elapsed} ago${expiresAt !== undefined && now > expiresAt ? ' · stale' : ''}`;
}

function ageLabel(from: number | null): string {
  if (from === null || !Number.isFinite(from)) return 'Unknown';
  const seconds = Math.max(0, Math.floor((Date.now() - from) / 1000));
  return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : seconds < 86400 ? `${Math.floor(seconds / 3600)}h` : `${Math.floor(seconds / 86400)}d`;
}

function authority(value: boolean | null, positive: string): string {
  return value === null ? 'unknown' : value ? positive : 'clear';
}

function detail(root: HTMLElement, label: string, value: string): void {
  const doc = root.ownerDocument;
  const line = doc.createElement('div');
  line.className = 'scout-pulse-tooltip-line';
  const name = doc.createElement('span');
  name.className = 'scout-pulse-tooltip-label';
  name.textContent = label;
  const content = doc.createElement('span');
  content.className = 'scout-pulse-tooltip-value';
  content.textContent = value;
  line.append(name, content);
  root.append(line);
}

function heading(root: HTMLElement, title: string): void {
  const el = root.ownerDocument.createElement('div');
  el.className = 'scout-pulse-tooltip-section';
  el.textContent = title;
  root.append(el);
}

function chip(doc: Document, text: string, kind: string): HTMLElement {
  const el = doc.createElement('span');
  el.className = `scout-pulse-tooltip-chip scout-pulse-tooltip-chip--${kind}`;
  el.textContent = text;
  return el;
}

/** Reuse the token-popup verdict styling so both popups look identical. */
function verdictChip(doc: Document, key: string, value: string, tone: string): HTMLElement {
  const el = doc.createElement('span');
  el.className = `scout-risk-verdict scout-risk-verdict--${tone}`;
  const name = doc.createElement('span');
  name.className = 'scout-risk-verdict-key';
  name.textContent = key;
  const content = doc.createElement('span');
  content.className = 'scout-risk-verdict-value';
  content.textContent = value;
  el.append(name, content);
  return el;
}

function developer(a: Assessment): string {
  const verdict = devStatus(a.token);
  if (verdict.label === 'RISKY DEV') return `RISKY DEV · ${verdict.reasons[0] ?? ''}`;
  const dev = a.token.developer;
  if (dev.source !== 'verified' || !dev.creator) return 'Unverified / unknown';
  const history = dev.priorLaunches === null ? 'history unknown' : `${dev.priorLaunches} prior launches`;
  const failures = dev.rapidFailures === null ? 'failures unknown' : `${dev.rapidFailures} rapid failures`;
  return `Verified creator · ${history} · ${failures}`;
}

/**
 * Render the hover popup for a Pulse row, mirroring the token-page Scout popup:
 * verdict chips, market & pool, token checks, signals, coin history and identity.
 * All third-party text is set with textContent, never parsed as HTML.
 */
export function renderPulseTooltip(
  container: HTMLElement,
  assessment: Assessment | null,
  mint: string | null,
  state: PulseTooltipState,
  now = Date.now(),
  rowInfo: PulseTooltipRowInfo = {}
): void {
  const doc = container.ownerDocument;
  const root = doc.createElement('div');
  root.className = 'scout-pulse-tooltip-content';
  const current = state === 'assessed' && assessment !== null ? assessment : null;
  const token = current?.token ?? null;
  const compact = rowInfo.compact === true;
  const readings = rowInfo.readings ?? null;

  const standing = current ? current.status
    : state === 'scanning' ? 'scanning'
    : mint ? 'no evidence yet'
    : 'mint hidden';

  const title = doc.createElement('strong');
  title.className = 'scout-pulse-tooltip-heading';
  title.textContent = `Scout · ${standing}`;
  root.append(title);

  if (token || readings?.symbol) {
    const identity = doc.createElement('div');
    identity.className = 'scout-pulse-tooltip-token';
    const symbol = doc.createElement('span');
    symbol.className = 'scout-pulse-tooltip-symbol';
    symbol.textContent = token?.symbol || readings?.symbol || '?';
    const name = doc.createElement('span');
    name.className = 'scout-pulse-tooltip-name';
    name.textContent = token?.name || '';
    identity.append(symbol, name);
    root.append(identity);
  }

  const chips = doc.createElement('div');
  chips.className = 'scout-pulse-tooltip-chips';
  if (rowInfo.stage) chips.append(chip(doc, stageLabel(rowInfo.stage), 'context'));
  const pageLabels = rowInfo.labels ? formatPulseLabels(rowInfo.labels) : null;
  if (pageLabels) chips.append(chip(doc, `Axiom: ${pageLabels}`, 'axiom'));
  if (current) {
    for (const tag of narrativeTags(current.token)) chips.append(chip(doc, `Narrative ${tag.tag}`, 'narrative'));
    for (const signal of attentionSignals(current.token, current.analytics)) {
      chips.append(chip(doc, signal.id === 'volume' ? 'High volume' : 'Broad buying', 'attention'));
    }
  }
  if (chips.childElementCount) root.append(chips);

  if (current) {
    const verdicts = doc.createElement('div');
    verdicts.className = 'scout-risk-verdicts';
    const dev = devStatus(current.token);
    const volume = volumeVerdict(current.token, current.analytics);
    const copies = rowInfo.similar ?? 0;
    const solPool = solPoolReading(current.token);
    const solFlow = solFlowReading(current.token);
    verdicts.append(
      verdictChip(doc, 'Dev', dev.label, dev.tone),
      verdictChip(doc, 'Volume', volume.level, volume.tone),
      verdictChip(doc, 'Vamp', copies > 0 ? `\u00d7${copies} copies` : 'unique', copies > 0 ? 'orange' : 'green'),
      verdictChip(doc, 'SOL pool', solPool.short, 'pool'),
      verdictChip(doc, '5m flow', solFlow.short, 'pool')
    );
    root.append(verdicts);

    const tags = tokenTags(current.token);
    if (tags.length) {
      const wrap = doc.createElement('div');
      wrap.className = 'scout-risk-tags';
      for (const tag of tags.slice(0, 3)) {
        const el = doc.createElement('span');
        el.className = 'scout-risk-tag';
        el.textContent = tag.label;
        el.style.setProperty('--scout-tag', tag.color);
        wrap.append(el);
      }
      root.append(wrap);
    }
  }

  if (current) {
    heading(root, 'Assessment');
    detail(root, 'Score', `${Math.round(current.score)}/100 · ${current.confidence} confidence`);
    detail(root, 'Observed', age(current.token.observedAt, current.expiresAt, now));
  }

  if (compact) {
    heading(root, 'Identity');
    detail(root, 'Mint', mint ?? 'Unknown, no exact token match');
    if (current) detail(root, 'Source', current.token.provider || 'Unknown');
    const note = doc.createElement('div');
    note.className = 'scout-pulse-tooltip-note';
    note.textContent = 'Details hidden \u00b7 press \u2212 in the bar to show market, checks and history.';
    root.append(note);
    renderIfChanged(container, `short|${state}|${mint ?? ''}|${root.textContent ?? ''}`, () => root);
    return;
  }

  if (current) {
    const t = current.token;
    const a = current.analytics;
    heading(root, 'Market & pool');
    const hasActivity = Boolean(t.marketSnapshot) || t.trades.length > 0;
    const platform = t.dexName ?? (t.provider.includes('GeckoTerminal') ? 'GeckoTerminal pool' : 'Unknown platform');
    detail(root, 'Platform', t.quoteSymbol ? `${platform} \u00b7 quoted in ${t.quoteSymbol}` : platform);
    if (t.poolAddresses?.[0]) detail(root, 'Pool', `${t.poolAddresses[0].slice(0, 6)}\u2026${t.poolAddresses[0].slice(-4)}`);
    detail(root, 'Pool age', `${ageLabel(t.launchedAt)}${t.stage !== 'unknown' ? ` \u00b7 ${t.stage}` : ''}`);
    detail(root, 'Price', usd(t.priceUsd));
    if (t.priceChange5mPct !== null) detail(root, 'Price 5m', `${t.priceChange5mPct.toFixed(1)}%`);
    detail(root, 'Liquidity', usd(t.liquidityUsd));
    detail(root, 'SOL in pool', solPoolReading(t).detail);
    detail(root, '5m SOL flow', solFlowReading(t).detail);
    if (t.liquidityChangePct !== null) detail(root, 'Liquidity chg', `${t.liquidityChangePct.toFixed(1)}%`);
    detail(root, '5m volume', hasActivity ? usd(a.volume5m) : 'Unknown');
    detail(root, 'Movement', movementVerdict(t, a).detail);
    detail(root, '5m buys/sells', hasActivity ? `${a.buys5m} / ${a.sells5m}` : 'Unknown');
    detail(root, '5m buyers/sellers', !hasActivity ? 'Unknown' : a.buyers5m !== null && a.sellers5m !== null ? `${a.buyers5m} / ${a.sellers5m}` : 'Not published');
    detail(root, 'Market cap', t.marketCapUsd !== null ? usd(t.marketCapUsd) : 'Unknown');
    detail(root, 'FDV', t.fdvUsd !== null ? usd(t.fdvUsd) : 'Unknown');
  }

  if (current) {
    const t = current.token;
    heading(root, 'Token checks');
    detail(root, 'Mint authority', t.mintAuthority === null ? 'Unknown' : t.mintAuthority ? 'Active (can mint)' : 'Revoked');
    detail(root, 'Freeze authority', t.freezeAuthority === null ? 'Unknown' : t.freezeAuthority ? 'Active (can freeze)' : 'Revoked');
    detail(root, 'Transfer control', t.transferRestriction === null ? 'Unknown' : t.transferRestriction ? 'Restricted' : 'Clear');
    detail(root, 'Top 10 holders', current.concentrationPct !== null ? `${current.concentrationPct.toFixed(1)}%` : 'Unknown');
    detail(root, 'Data completeness', `${current.dataCompletenessPct}% \u00b7 ${current.confidence} confidence`);

    heading(root, 'Developer');
    detail(root, 'Creator', developer(current));
    detail(root, 'Security', `Mint: ${authority(t.mintAuthority, 'active')} \u00b7 Freeze: ${authority(t.freezeAuthority, 'active')} \u00b7 Transfer: ${authority(t.transferRestriction, 'restricted')}`);

    const concern = current.critical[0] ?? current.warnings[0];
    if (current.positives.length || concern || current.missing.length) {
      heading(root, 'Signals');
      if (current.positives.length) detail(root, 'Positive', current.positives[0] ?? '');
      if (concern) detail(root, 'Concern', concern);
      if (current.missing.length) detail(root, 'Missing', current.missing[0] ?? '');
    }

    if (rowInfo.observedHigh || (rowInfo.similar ?? 0) > 0) {
      heading(root, 'Coin history');
      if (rowInfo.observedHigh) {
        const parts = [usd(rowInfo.observedHigh.priceUsd), rowInfo.observedHigh.marketCapUsd !== null ? `${usd(rowInfo.observedHigh.marketCapUsd)} mkt cap` : null].filter(Boolean).join(' \u00b7 ');
        detail(root, 'Observed high', parts || 'Unknown');
      }
      if ((rowInfo.similar ?? 0) > 0) detail(root, 'Copycat / vampire', `${rowInfo.similar} same-name coin(s) seen before`);
    }
  } else {
    const live: [string, string][] = [];
    if (readings) {
      const pairs: [string, string | null][] = [
        ['Price', readings.price], ['Change', readings.change], ['Age', readings.age],
        ['Market cap', readings.marketCap], ['Liquidity', readings.liquidity],
        ['Volume', readings.volume], ['Trades', readings.trades]
      ];
      for (const [label, value] of pairs) if (value) live.push([label, value]);
    }
    if (live.length) {
      heading(root, 'Live on this card');
      for (const [label, value] of live) detail(root, label, value);
    }
    heading(root, 'Scout scan');
    if (mint) {
      detail(root, 'Status', rowInfo.attempted ? 'No pool or security data returned yet' : 'First lookup in flight');
      detail(root, 'SOL in pool', rowInfo.attempted ? 'Exact reserve not published yet' : 'Checking exact mint');
      detail(root, '5m SOL flow', rowInfo.attempted ? 'Exact flow not published yet' : 'Checking exact pool');
      detail(root, 'Next check', `Every ${rowInfo.intervalSeconds ?? 15}s while this tab is open`);
    } else {
      detail(root, 'Mint', 'Not readable from this card');
      detail(root, 'Why', 'Scout will not guess a mint, so no score is claimed');
    }
  }

  if (mint) {
    heading(root, 'Identity');
    detail(root, 'Mint', mint);
    if (current) detail(root, 'Source', current.token.provider || 'Unknown');
  }

  renderIfChanged(container, `full|${state}|${mint ?? ''}|${root.textContent ?? ''}`, () => root);
}
