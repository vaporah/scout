import { movementVerdict, volumeVerdict } from './attention.js';
import { solFlowReading, solPoolReading } from './poolLiquidity.js';
import { scoutMark } from './asset.js';
import { tokenTags } from './categories.js';
import type { TokenHistoryView } from './coinHistory.js';
import { devStatus } from './developerReputation.js';
import { attachOverlayFrame, applyOverlayRect } from './overlayFrame.js';
import { holderReadings, shortWallet, type HolderReading } from './holders.js';
import { loadOverlayFlags, loadOverlayRects, saveOverlayFlag, saveOverlayRect } from './overlayPrefs.js';
import { warningFor, type Severity } from './riskWarning.js';
import { trapCheck } from './trapCheck.js';
import type { Assessment, Settings, Token } from './types.js';

/** Developer provenance badge read from the host page (for example Axiom PROVEN DEV). */
export interface PageDevBadge {
  classification: string;
  tone: 'green' | 'red' | 'neutral';
  details: string[];
}

export interface RiskOverlayOptions {
  document?: Document;
  /** Explorer link builder for a mint, defaulting to Solscan. */
  explorerUrl?: (mint: string) => string;
  /** Explorer link builder for a wallet, defaulting to Solscan. */
  accountUrl?: (wallet: string) => string;
}

/** The verdict plus the reasoning the popup renders for it. */
interface VerdictView {
  tone: Severity;
  category: string;
  summary: string;
  reasons: string[];
  disclaimer: string | null;
}

const severityLabel = { red: 'CRITICAL', orange: 'CAUTION', neutral: 'UNKNOWN', green: 'NO FLAG' } as const;
/** Plain-language name for the badge tooltip, so the colour is never the only signal. */
const severityWord = { red: 'Risk detected', orange: 'Caution', neutral: 'Unknown', green: 'All clear' } as const;

const usd = (value: number | null | undefined): string => {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Unknown';
  return value < 0.01 ? `$${value.toPrecision(3)}` : `$${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
};

const when = (at: number | null): string => at === null ? 'unknown time' : new Date(at).toLocaleString();

const ageLabel = (from: number | null): string => {
  if (from === null || !Number.isFinite(from)) return 'Unknown';
  const seconds = Math.max(0, Math.floor((Date.now() - from) / 1000));
  return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : seconds < 86400 ? `${Math.floor(seconds / 3600)}h` : `${Math.floor(seconds / 86400)}d`;
};

const shortMint = (mint: string): string => `${mint.slice(0, 6)}\u2026${mint.slice(-4)}`;

/**
 * Top-right Scout popup on a token chart page. It always presents a verdict:
 * an evidence-based warning when one exists, otherwise the host page's developer
 * badge or a green "no critical risk flagged" state. It also shows coin history
 * (all-time high, Scout-observed high, and older coins sharing the name).
 */
export function createRiskOverlay(options: RiskOverlayOptions = {}) {
  const doc = options.document ?? document;
  const explorerUrl = options.explorerUrl ?? ((mint) => `https://solscan.io/token/${mint}`);
  const accountUrl = options.accountUrl ?? ((wallet) => `https://solscan.io/account/${wallet}`);
  let panel: HTMLElement | null = null;
  let resizeHandle: HTMLElement | null = null;
  let detachFrame: (() => void) | null = null;
  let dismissedMint: string | null = null;
  let collapsed = false;
  let short = false;
  let signature = '';
  let lastMint: string | null = null;
  let shortButton: HTMLElement | null = null;
  let collapseButton: HTMLElement | null = null;
  let lastRender: { assessment: Assessment | null; view: VerdictView; history: TokenHistoryView | null } | null = null;

  /** Keep the header buttons' labels, tooltips and state in step. */
  function syncButtons(): void {
    if (collapseButton) {
      collapseButton.textContent = collapsed ? '+' : '\u2212';
      collapseButton.setAttribute('aria-label', collapsed ? 'Expand popup' : 'Collapse popup');
      collapseButton.setAttribute('title', collapsed ? 'Expand' : 'Collapse to header only');
    }
    if (shortButton) {
      shortButton.textContent = short ? '\u25b4' : '\u25be';
      shortButton.setAttribute('aria-label', short ? 'Show market, checks and history' : 'Hide market, checks and history, keeping the holder data');
      shortButton.setAttribute('title', short ? 'Show all details' : 'Show only the verdict and holders');
    }
  }

  function element(tag: string, className: string, text?: string): HTMLElement {
    const node = doc.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function link(className: string, href: string, text: string): HTMLElement {
    const node = element('a', className, text);
    node.setAttribute('href', href);
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
    return node;
  }

  function ensurePanel(): HTMLElement {
    if (panel) {
      if (!panel.isConnected) doc.documentElement?.append(panel);
      return panel;
    }
    panel = element('aside', 'scout-risk');
    panel.setAttribute('role', 'alertdialog');
    panel.setAttribute('aria-label', 'Scout token popup');
    panel.addEventListener('click', onPanelClick);
    resizeHandle = element('div', 'scout-risk-resize');
    resizeHandle.setAttribute('title', 'Drag to resize');
    panel.append(resizeHandle);
    detachFrame = attachOverlayFrame(panel, {
      document: doc,
      handle: panel,
      resize: resizeHandle,
      minWidth: 260,
      minHeight: 220,
      maxWidth: 720,
      maxHeight: 760,
      resizeAxis: 'both',
      isBlocked: target => !target.closest('.scout-risk-head') || !!target.closest('button'),
      onCommit: rect => { void saveOverlayRect('risk', rect); }
    });
    doc.documentElement?.append(panel);
    void loadOverlayRects().then(saved => { if (panel && saved.risk) applyOverlayRect(panel, saved.risk); });
    void loadOverlayFlags().then(flags => {
      collapsed = flags.riskCollapsed ?? false;
      short = flags.riskShort ?? false;
      panel?.classList.toggle('is-collapsed', collapsed);
      syncButtons();
    });
    return panel;
  }

  function onPanelClick(event: Event): void {
    const target = event.target as Element | null;
    if (!panel) return;
    if (target?.closest('[data-scout-action="dismiss"]')) {
      dismissedMint = panel.dataset.scoutMint ?? null;
      panel.classList.remove('is-visible');
      return;
    }
    if (target?.closest('[data-scout-action="collapse"]')) {
      collapsed = !collapsed;
      panel.classList.toggle('is-collapsed', collapsed);
      if (collapsed) {
        panel.dataset.scoutExpandedHeight = panel.style.height;
        panel.style.height = '';
      } else {
        panel.style.height = panel.dataset.scoutExpandedHeight ?? '';
      }
      void saveOverlayFlag('riskCollapsed', collapsed);
      syncButtons();
      return;
    }
    if (target?.closest('[data-scout-action="shorten"]')) {
      short = !short;
      void saveOverlayFlag('riskShort', short);
      syncButtons();
      // Force a fresh build so the sections are re-evaluated while keeping the
      // size the person explicitly selected.
      signature = '';
      if (lastRender) render(lastRender.assessment, lastRender.view, lastRender.history);
    }
  }

  function row(wrap: HTMLElement, key: string, value: string): void {
    const line = element('div', 'scout-risk-history-line');
    line.append(element('span', 'scout-risk-history-key', key), element('span', 'scout-risk-history-value', value));
    wrap.append(line);
  }

  /**
   * Who is holding, as opposed to how much is held.
   *
   * A holder count says little on its own: a thousand wallets funded to buy the launch is
   * a different trade from a thousand that found it on their own, and a deployer on their
   * twenty-eighth token is a different counterparty from one on their first. This is the
   * block that separates those cases, and it is why it sits with the holder data rather
   * than behind "hide details".
   */
  function walletQualitySection(assessment: Assessment): HTMLElement | null {
    const quality = assessment.token.holderQuality;
    if (!quality) return null;
    const wrap = element('div', 'scout-risk-history');
    wrap.append(element('div', 'scout-risk-history-title', 'Wallet quality'));
    if (quality.devLaunches !== null) {
      row(wrap, 'Dev track record', quality.devLaunches === 0
        ? 'First token from this creator'
        : `${quality.devLaunches.toLocaleString('en-US')} token${quality.devLaunches === 1 ? '' : 's'} from this creator`);
    }
    if (quality.bundlerPct !== null) row(wrap, 'Bundled buys', `${quality.bundlerPct.toFixed(1)}% of supply`);
    if (quality.sniperPct !== null) row(wrap, 'Snipers', `${quality.sniperPct.toFixed(1)}% of supply`);
    if (quality.botDegenPct !== null) row(wrap, 'Bots / degen', `${quality.botDegenPct.toFixed(1)}% of supply`);
    if (quality.freshWalletPct !== null) row(wrap, 'Fresh wallets', `${quality.freshWalletPct.toFixed(1)}% of supply`);
    // A heading with nothing under it is worse than no section at all.
    return wrap.childElementCount > 1 ? wrap : null;
  }

  function insiderSection(assessment: Assessment): HTMLElement {
    const flow = assessment.token.insiderFlow;
    const wrap = element('div', 'scout-risk-history');
    wrap.append(element('div', 'scout-risk-history-title', 'Insider exit watch'));
    if (!flow || flow.currentHoldingPct === null) {
      row(wrap, 'Insider holdings', 'Unavailable from current sources');
      row(wrap, 'Exit signal', flow?.liquidityDropPct !== null && flow?.liquidityDropPct !== undefined
        ? `${flow.liquidityDropPct.toFixed(1)}% liquidity decline from observed peak`
        : 'Waiting for a labelled insider baseline');
      return wrap;
    }
    row(wrap, 'Identified insiders', `${flow.currentHoldingPct.toFixed(1)}% of supply · ${flow.linkedWallets.length} wallet(s)`);
    row(wrap, 'Supply moved out', flow.soldPct !== null ? `${flow.soldPct.toFixed(1)} percentage points` : 'No baseline yet');
    row(wrap, 'Liquidity from peak', flow.liquidityDropPct !== null ? `−${flow.liquidityDropPct.toFixed(1)}%` : 'Unknown');
    row(wrap, 'Status', flow.status === 'exit' ? 'EXIT DETECTED' : flow.status === 'selling' ? 'SELLING' : 'Watching');
    return wrap;
  }

  function trapSection(assessment: Assessment): HTMLElement {
    const result = trapCheck(assessment);
    const wrap = element('div', 'scout-risk-history');
    wrap.append(element('div', 'scout-risk-history-title', `Trap check · ${result.verdict}`));
    const add = (label: string, items: string[]): void => { if (items.length) row(wrap, label, items.slice(0, 3).join(' · ')); };
    add('Red flags', result.redFlags);
    add('Cautions', result.warnings);
    add('Looks clean', result.clean);
    add('Still missing', result.missing);
    return wrap;
  }

  function checkpointSection(assessment: Assessment): HTMLElement {
    const point = assessment.token.launchCheckpoint;
    const wrap = element('div', 'scout-risk-history');
    wrap.append(element('div', 'scout-risk-history-title', '60-second checkpoint'));
    if (!point || point.capturedAt === null) {
      const remaining = point ? Math.max(0, Math.ceil((point.dueAt - Date.now()) / 1000)) : 60;
      row(wrap, 'Status', `Watching · ${remaining}s remaining`);
      row(wrap, 'Basis', 'Measured from Scout’s first observation');
      return wrap;
    }
    row(wrap, 'Price after 60s', point.priceChangePct !== null ? `${point.priceChangePct >= 0 ? '+' : ''}${point.priceChangePct.toFixed(1)}%` : 'Unknown');
    row(wrap, 'Market cap after 60s', point.marketCapChangePct !== null ? `${point.marketCapChangePct >= 0 ? '+' : ''}${point.marketCapChangePct.toFixed(1)}%` : 'Unknown');
    row(wrap, 'Basis', 'Scout-observed checkpoint, not launch-block history');
    return wrap;
  }

  function marketSection(assessment: Assessment): HTMLElement {    const token = assessment.token;
    const a = assessment.analytics;
    const hasActivity = Boolean(token.marketSnapshot) || token.trades.length > 0;
    const wrap = element('div', 'scout-risk-history');
    wrap.append(element('div', 'scout-risk-history-title', 'Market & pool'));
    const platform = token.dexName ?? (token.provider.includes('GeckoTerminal') ? 'GeckoTerminal pool' : 'Unknown platform');
    const pair = token.quoteSymbol ? `${platform} \u00b7 quoted in ${token.quoteSymbol}` : platform;
    row(wrap, 'Platform', pair);
    if (token.poolAddresses?.[0]) row(wrap, 'Pool', shortMint(token.poolAddresses[0]));
    row(wrap, 'Pool age', `${ageLabel(token.launchedAt)}${token.stage !== 'unknown' ? ` \u00b7 ${token.stage}` : ''}`);
    row(wrap, 'Price', usd(token.priceUsd));
    if (token.priceChange5mPct !== null) row(wrap, 'Price 5m', `${token.priceChange5mPct.toFixed(1)}%`);
    row(wrap, 'Liquidity', usd(token.liquidityUsd));
    row(wrap, 'SOL in pool', solPoolReading(token).detail);
    row(wrap, '5m SOL flow', solFlowReading(token).detail);
    if (token.liquidityChangePct !== null) row(wrap, 'Liquidity chg', `${token.liquidityChangePct.toFixed(1)}%`);
    row(wrap, '5m volume', hasActivity ? usd(a.volume5m) : 'Unknown');
    // The score is largely made of fields a new pair has not published yet, so how hard
    // the coin is actually trading is stated here in its own right.
    row(wrap, 'Movement', movementVerdict(token, a).detail);
    row(wrap, '5m buys / sells', hasActivity ? `${a.buys5m} / ${a.sells5m}` : 'Unknown');
    row(wrap, '5m buyers / sellers', !hasActivity ? 'Unknown' : a.buyers5m !== null && a.sellers5m !== null ? `${a.buyers5m} / ${a.sellers5m}` : 'Not published');
    row(wrap, 'Market cap', token.marketCapUsd !== null ? usd(token.marketCapUsd) : 'Unknown');
    row(wrap, 'FDV', token.fdvUsd !== null ? usd(token.fdvUsd) : 'Unknown');
    return wrap;
  }

  function checksSection(assessment: Assessment): HTMLElement {
    const token = assessment.token;
    const wrap = element('div', 'scout-risk-history');
    wrap.append(element('div', 'scout-risk-history-title', 'Token checks'));
    row(wrap, 'Mint authority', token.mintAuthority === null ? 'Unknown' : token.mintAuthority ? 'Active (can mint)' : 'Revoked');
    row(wrap, 'Freeze authority', token.freezeAuthority === null ? 'Unknown' : token.freezeAuthority ? 'Active (can freeze)' : 'Revoked');
    row(wrap, 'Transfer control', token.transferRestriction === null ? 'Unknown' : token.transferRestriction ? 'Restricted' : 'Clear');
    // A stated top-ten figure answers this even when no wallet list was published.
    const concentration = assessment.concentrationPct ?? token.top10HoldPct ?? null;
    row(wrap, 'Top 10 holders', concentration !== null ? `${concentration.toFixed(1)}%` : 'Unknown');
    row(wrap, 'Data completeness', `${assessment.dataCompletenessPct}% \u00b7 ${assessment.confidence} confidence`);
    return wrap;
  }

  /**
   * Holder distribution: how spread out a coin is, and what the developer behind it
   * still holds. Bars are scaled to the largest holder so the ranking is readable,
   * while the exact share of supply is printed next to every row.
   *
   * The section always renders. Omitted output is indistinguishable from the feature
   * not working, so when no provider publishes a breakdown yet it says that instead.
   */
  function holdersSection(assessment: Assessment): HTMLElement {
    const wrap = element('div', 'scout-risk-history');
    wrap.append(element('div', 'scout-risk-history-title', 'Holders'));
    const reading = holderReadings(assessment.token);
    // The same rows in the same order whether or not the data arrived. A missing
    // breakdown used to collapse the whole block into a shorter, different-looking
    // panel, which read as a lesser popup rather than as the same popup with a gap.
    if (!reading) {
      row(wrap, 'Holders', 'Not published yet');
      row(wrap, 'Top 10 hold', 'Not published yet');
      row(wrap, 'Biggest wallet', 'Not published yet');
      row(wrap, 'Dev / creator holding', assessment.token.developer.creator
        ? `Creator wallet ${shortWallet(assessment.token.developer.creator)} \u00b7 holdings not published`
        : 'Creator wallet is not identified for this token');
      wrap.append(element('p', 'scout-risk-note',
        'No holder breakdown has been published for this mint yet. Newly launched tokens usually get one once they have traded for a while, and Scout fills this in on its next scan.'));
      return wrap;
    }
    row(wrap, 'Holders', reading.count !== null ? reading.count.toLocaleString('en-US') : 'Not published');
    if (reading.topPct !== null && reading.listed) row(wrap, `Top ${reading.listed} hold`, `${reading.topPct.toFixed(1)}%`);
    else if (reading.top10Pct !== null) row(wrap, 'Top 10 hold', `${reading.top10Pct.toFixed(1)}%`);
    // A vault is labelled as an account, not a wallet, so the number cannot be misread
    // as one person controlling the supply.
    if (reading.largest) row(wrap, reading.largest.type === 'pool' ? 'Largest account' : 'Biggest wallet', `${reading.largest.pct.toFixed(2)}% \u00b7 ${shortWallet(reading.largest.wallet)}`);
    row(wrap, 'Dev / creator holding', creatorHoldingLine(reading));

    // Distribution bands: the fallback that still gives real percentages on tokens
    // whose individual wallets are not published.
    if (reading.bands.length) {
      const bandList = element('div', 'scout-risk-holders');
      const widest = Math.max(...reading.bands.map(band => band.pct), 1);
      for (const band of reading.bands) {
        const line = element('div', 'scout-risk-holder');
        line.append(element('span', 'scout-risk-holder-rank', ''));
        const bar = element('span', 'scout-risk-holder-bar');
        const fill = element('span', 'scout-risk-holder-fill');
        fill.style.width = `${Math.max(2, Math.round(band.pct / widest * 100))}%`;
        bar.append(fill);
        line.append(bar);
        line.append(element('span', 'scout-risk-holder-pct', `${band.pct.toFixed(1)}%`));
        line.append(element('span', 'scout-risk-holder-band', band.label));
        bandList.append(line);
      }
      wrap.append(bandList);
    }

    const widest = reading.largest?.pct ?? 0;
    if (reading.top.length) {
      const list = element('div', 'scout-risk-holders');
      reading.top.forEach((holder, index) => {
        const line = element('div', 'scout-risk-holder');
        line.append(element('span', 'scout-risk-holder-rank', `${index + 1}`));
        const bar = element('span', 'scout-risk-holder-bar');
        const fill = element('span', 'scout-risk-holder-fill');
        fill.style.width = `${widest > 0 ? Math.max(2, Math.round(holder.pct / widest * 100)) : 2}%`;
        bar.append(fill);
        line.append(bar);
        line.append(element('span', 'scout-risk-holder-pct', `${holder.pct.toFixed(2)}%`));
        const who = link('scout-risk-holder-wallet', accountUrl(holder.wallet), shortWallet(holder.wallet));
        who.setAttribute('title', [
          holder.wallet,
          `${holder.pct.toFixed(4)}% of total supply`,
          holder.tag,
          holder.locked ? 'reported as locked' : null
        ].filter(Boolean).join(' \u00b7 '));
        line.append(who);
        list.append(line);
      });
      wrap.append(list);
    }
    if (reading.note) wrap.append(element('p', 'scout-risk-note', reading.note));
    return wrap;
  }

  /** Plain-language answer to "what does the dev still hold?", including "cannot tell". */
  function creatorHoldingLine(reading: HolderReading): string {
    if (!reading.creatorKnown) return 'Creator wallet is not identified for this token';
    const creator = reading.creator;
    if (!creator) return 'Unknown';
    const share = creator.pct !== null ? `${creator.pct.toFixed(2)}%` : 'Unknown share';
    const where = creator.basis === 'ranked' ? `wallet #${creator.rank}`
      : creator.basis === 'feed' ? 'reported by the feed'
      : reading.top.length ? `outside the listed top ${reading.listed}` : 'holder breakdown not published';
    return `${share} \u00b7 ${where}${creator.locked ? ' \u00b7 locked' : ''}`;
  }

  /**
   * Coin history always answers the vampire question: either the copies Scout knows
   * about, or a plain statement that none were found. A feed-sourced copy gets its own
   * wording, because Scout has not seen it trade, only the ticker matches.
   */
  function historySection(history: TokenHistoryView | null): HTMLElement | null {
    if (!history) return null;
    const wrap = element('div', 'scout-risk-history');
    wrap.append(element('div', 'scout-risk-history-title', 'Coin history'));
    if (history.ath) row(wrap, 'All-time high', `${usd(history.ath.priceUsd)} \u00b7 ${history.ath.source}`);
    if (history.observedHigh) {
      const parts = [usd(history.observedHigh.priceUsd), history.observedHigh.marketCapUsd !== null ? `${usd(history.observedHigh.marketCapUsd)} mkt cap` : null].filter(Boolean).join(' \u00b7 ');
      row(wrap, 'Scout-observed high', `${parts || 'Unknown'} \u00b7 ${when(history.observedHigh.at)}`);
    }

    const copies = history.similar.length;
    if (copies > 0) {
      const oldest = history.similar[0];
      const fed = history.similar.filter(item => item.source === 'feed').length;
      const detail = [
        oldest ? `oldest: ${oldest.symbol || oldest.name}${oldest.source === 'feed' ? ' (feed ticker match)' : ` · first seen ${when(oldest.firstSeenAt)}`}` : null,
        fed > 0 ? `${fed} from the public feed` : 'all seen by Scout'
      ].filter(Boolean).join(' \u00b7 ');
      row(wrap, `Copycat/vampire (${copies})`, `Same name as ${oldest?.symbol || oldest?.name || 'another coin'} \u00b7 ${detail}`);
      const links = element('div', 'scout-risk-links');
      if (oldest) links.append(link('scout-risk-link', explorerUrl(oldest.mint), 'Oldest coin on explorer'));
      for (const item of history.similar.slice(1, 3)) links.append(link('scout-risk-link', explorerUrl(item.mint), `${item.symbol || item.name} on explorer`));
      if (links.childElementCount) wrap.append(links);
    } else {
      row(wrap, 'Copycat/vampire', 'None found');
      row(wrap, 'Vampire check', history.feedChecked
        ? 'No other Solana pool uses this ticker, and Scout has not seen another coin by this name'
        : 'Scout has not seen another coin with this name yet');
    }
    return wrap;
  }

  function verdictChip(key: string, value: string, tone: string, title?: string): HTMLElement {
    const chip = element('span', `scout-risk-verdict scout-risk-verdict--${tone}`);
    if (title) chip.setAttribute('title', title);
    chip.append(element('span', 'scout-risk-verdict-key', key), element('span', 'scout-risk-verdict-value', value));
    return chip;
  }

  /** Plain-language Dev / Volume / Vamp verdicts shown at the top of the popup. */
  function verdictStrip(assessment: Assessment, history: TokenHistoryView | null): HTMLElement {
    const strip = element('div', 'scout-risk-verdicts');
    const dev = devStatus(assessment.token);
    const volume = volumeVerdict(assessment.token, assessment.analytics);
    const copies = history?.similar.length ?? 0;
    const solPool = solPoolReading(assessment.token);
    const solFlow = solFlowReading(assessment.token);
    const insider = assessment.token.insiderFlow;
    const insiderValue = insider?.status === 'exit' ? 'EXIT'
      : insider?.status === 'selling' ? 'SELLING'
      : insider?.currentHoldingPct !== null && insider?.currentHoldingPct !== undefined ? `${insider.currentHoldingPct.toFixed(1)}%`
      : 'unknown';
    const insiderTone = insider?.status === 'exit' ? 'red' : insider?.status === 'selling' ? 'orange' : 'neutral';
    const trap = trapCheck(assessment);
    const trapTone = trap.verdict === 'RED' ? 'red' : trap.verdict === 'YELLOW' ? 'orange' : trap.verdict === 'GREEN' ? 'green' : 'neutral';
    // The vampire verdict names the count, and says plainly when none were found.
    const vamp = copies > 0
      ? verdictChip('Vamp', `${copies} ${copies === 1 ? 'copy' : 'copies'}`, copies >= 3 ? 'red' : 'orange', `${copies} other coin(s) trade under this name or ticker`)
      : verdictChip('Vamp', 'no copies', 'green', history?.feedChecked ? 'No other Solana pool uses this ticker and Scout has seen no other coin by this name' : 'Scout has not seen another coin with this name yet');
    strip.append(
      verdictChip('Dev', dev.label, dev.tone, dev.reasons[0] ?? ''),
      verdictChip('Volume', volume.level, volume.tone),
      verdictChip('Insiders', insiderValue, insiderTone, 'Tracks explicitly labelled insider holdings and changes from Scout’s observed peak'),
      verdictChip('Trap', trap.verdict, trapTone, [...trap.redFlags, ...trap.warnings, ...trap.missing][0] ?? 'No configured trap sign found'),
      vamp,
      verdictChip('SOL pool', solPool.short, 'pool', solPool.detail),
      verdictChip('5m flow', solFlow.short, 'pool', solFlow.detail)
    );
    return strip;
  }

  /** Colored platform / category chips (pump.fun, Raydium, Charity, ...). */
  function categoryRow(assessment: Assessment): HTMLElement | null {
    const tags = tokenTags(assessment.token);
    if (!tags.length) return null;
    const wrap = element('div', 'scout-risk-tags');
    for (const tag of tags.slice(0, 3)) {
      const chip = element('span', 'scout-risk-tag', tag.label);
      chip.style.setProperty('--scout-tag', tag.color);
      wrap.append(chip);
    }
    return wrap;
  }

  function render(assessment: Assessment | null, view: VerdictView, history: TokenHistoryView | null, mintOverride: string | null = null): void {
    lastRender = { assessment, view, history };
    const root = ensurePanel();
    const token: Token | null = assessment?.token ?? null;
    // A token page Scout has no data for yet still knows which mint it is looking at,
    // so the panel can carry that identity and stay dismissible per token.
    const mint = token?.mint ?? mintOverride;

    const head = element('header', 'scout-risk-head');
    // The mascot doubles as the severity badge: the circle behind it is green for a
    // clean verdict, amber while Scout is still gathering evidence, red for a
    // detected risk and grey when the result is unknown.
    const icon = scoutMark(doc, 'scout-risk-icon');
    icon.setAttribute('title', `${severityWord[view.tone]} \u00b7 Scout`);
    const titles = element('div', 'scout-risk-titles');
    titles.append(element('strong', 'scout-risk-brand', 'SCOUT'), element('span', 'scout-risk-category', view.category));
    const shorten = element('button', 'scout-risk-btn', '\u25be') as HTMLButtonElement;
    shorten.type = 'button';
    shorten.setAttribute('data-scout-action', 'shorten');
    const collapse = element('button', 'scout-risk-btn', '\u2212') as HTMLButtonElement;
    collapse.type = 'button';
    collapse.setAttribute('data-scout-action', 'collapse');
    collapse.setAttribute('aria-label', 'Collapse popup');
    const dismiss = element('button', 'scout-risk-btn', '\u00d7') as HTMLButtonElement;
    dismiss.type = 'button';
    dismiss.setAttribute('data-scout-action', 'dismiss');
    dismiss.setAttribute('aria-label', 'Dismiss popup for this token');
    head.append(icon, titles, shorten, collapse, dismiss);

    const body = element('div', 'scout-risk-body');
    const meta = element('div', 'scout-risk-meta');
    // The stand-in token the feeds return for an unindexed mint carries '?' as its ticker.
    // Showing that as though it were the symbol is noise; the mint is the honest identity.
    if (token) meta.append(metaChip(token.symbol && token.symbol !== '?' ? token.symbol : shortMint(token.mint), 'symbol'));
    // No token at all still means Scout knows which mint it looked up. Showing it is the
    // difference between "Scout found nothing" and "Scout looked up the wrong address".
    else if (mint) meta.append(metaChip(shortMint(mint), 'symbol'));
    if (assessment) meta.append(metaChip(assessment.status, 'status'), metaChip(`${Math.round(assessment.score)}/100`, 'score'));
    meta.append(metaChip(severityLabel[view.tone], `tone-${view.tone}`));
    body.append(meta, element('p', 'scout-risk-summary', view.summary));

    if (assessment) body.append(verdictStrip(assessment, history));

    if (assessment) { const categories = categoryRow(assessment); if (categories) body.append(categories); }

    // Holder distribution sits above the market readout and is deliberately NOT gated
    // behind the "hide details" mode: who holds the coin, and what the dev still holds,
    // is the one block that stays on screen for every coin in every mode, including
    // UNKNOWN DEV, where it is the only real evidence there is.
    if (assessment) body.append(holdersSection(assessment));

    // Who holds it belongs with how much is held, so it follows the holder block and
    // stays on screen in short mode for the same reason the holder block does.
    if (assessment) { const quality = walletQualitySection(assessment); if (quality) body.append(quality); }

    if (assessment) body.append(insiderSection(assessment));

    if (assessment) body.append(trapSection(assessment), checkpointSection(assessment));

    if (assessment && !short) body.append(marketSection(assessment));

    if (assessment && !short) body.append(checksSection(assessment));

    if (!short) {
      const historyEl = historySection(history);
      if (historyEl) body.append(historyEl);
    }

    if (view.reasons.length) {
      const evidence = doc.createElement('details');
      evidence.className = 'scout-risk-evidence';
      const summaryEl = doc.createElement('summary');
      summaryEl.textContent = 'View evidence';
      evidence.append(summaryEl);
      const list = doc.createElement('ul');
      for (const reason of view.reasons) list.append(element('li', 'scout-risk-reason', reason));
      evidence.append(list);
      if (view.disclaimer) evidence.append(element('p', 'scout-risk-disclaimer', view.disclaimer));
      if (token) {
        const links = element('div', 'scout-risk-links');
        links.append(link('scout-risk-link', explorerUrl(token.mint), 'Token on explorer'));
        if (token.developer.creator) links.append(link('scout-risk-link', accountUrl(token.developer.creator), 'Creator wallet'));
        if (token.sourceUrl) links.append(link('scout-risk-link', token.sourceUrl, 'Source pool'));
        evidence.append(links);
      }
      body.append(evidence);
    }

    if (short) body.append(element('p', 'scout-risk-note', 'Market, checks and history hidden \u00b7 press \u25be above to show them. Holder data stays on screen.'));

    // Nothing changed since the last render: leave the live DOM (and its scroll
    // position, open evidence section and animation) exactly as it is.
    const next = [view.tone, view.category, collapsed ? 'c' : 'f', short ? 's' : 'l', body.textContent ?? ''].join('|');
    shortButton = shorten;
    collapseButton = collapse;
    if (next === signature) { root.classList.add('is-visible'); syncButtons(); return; }

    const evidence = body.querySelector<HTMLDetailsElement>('details');
    const wasOpen = root.querySelector<HTMLDetailsElement>('.scout-risk-evidence')?.open ?? false;
    if (wasOpen && evidence) evidence.open = true;
    const scrollTop = root.querySelector<HTMLElement>('.scout-risk-body')?.scrollTop ?? 0;
    const tokenChanged = mint !== lastMint;
    if (tokenChanged) root.classList.remove('is-visible');
    root.replaceChildren();
    if (mint) root.dataset.scoutMint = mint;
    else root.removeAttribute('data-scout-mint');
    root.dataset.scoutSeverity = view.tone;
    root.classList.toggle('is-collapsed', collapsed);
    root.append(head, body);
    if (resizeHandle) root.append(resizeHandle);
    if (scrollTop > 0) body.scrollTop = scrollTop;
    if (tokenChanged) void root.offsetWidth; // restart the entry animation only for a new token
    root.classList.add('is-visible');
    signature = next;
    lastMint = mint;
    syncButtons();
  }

  /** Small uppercase chip used for the symbol / status / score / severity row. */
  function metaChip(text: string, kind: string): HTMLElement {
    return element('span', `scout-risk-meta-chip scout-risk-meta-chip--${kind}`, text);
  }

  return {
    /** Host SPAs sometimes replace body children; restore the existing live panel. */
    ensureAttached(): void {
      if (!lastRender || !panel) return;
      const root = ensurePanel();
      root.classList.add('is-visible');
    },
    /**
     * The page is a token page with a full mint, but Scout has no independent data
     * for it yet. Showing an explicit "nothing yet" state beats showing nothing at
     * all: silence is indistinguishable from Scout being broken, and it hides the
     * fact that a retry is already on its way while the page stays open.
     */
    showUnscanned(mint: string, reason = ''): void {
      if (mint === dismissedMint) return;
      render(null, {
        tone: 'neutral',
        category: 'NOT SCANNED YET',
        summary: reason || 'Scout could not find independent market data for this exact mint yet. It keeps retrying while this page stays open.',
        reasons: [
          `Scout looked up ${mint} and no source returned a pool for it.`,
          'No pool data was returned for this exact mint, so there is nothing to score yet.',
          'Scout never reuses an earlier score for a mint it cannot currently verify.',
          'This is not a claim about the coin: it means Scout has no evidence yet, not that the coin is unsafe.'
        ],
        disclaimer: 'Retrying automatically while this page stays open.'
      }, null, mint);
    },

    /**
     * Refresh the popup. A null assessment with no page badge hides it;
     * otherwise a verdict is always shown.
     */
    update(assessment: Assessment | null, settings: Settings, pageBadge: PageDevBadge | null = null, history: TokenHistoryView | null = null): void {
      if (!assessment && !pageBadge) {
        // Also clear a panel left behind by an older, invalidated content-script
        // context. This makes list-page teardown idempotent across extension reloads.
        for (const existing of Array.from(doc.querySelectorAll('.scout-risk'))) existing.classList.remove('is-visible');
        return;
      }
      const mint = assessment?.token.mint ?? null;
      if (mint && mint === dismissedMint) return;

      const warning = assessment ? warningFor(assessment, settings) : null;
      if (warning) {
        render(assessment, { tone: warning.severity, category: warning.category, summary: warning.summary, reasons: warning.reasons, disclaimer: null }, history);
        return;
      }

      const status = assessment ? devStatus(assessment.token) : null;
      if (pageBadge) {
        render(assessment, {
          tone: pageBadge.tone, category: pageBadge.classification,
          summary: pageBadge.details[0] ?? 'The host page reports a developer provenance result for this token.',
          reasons: pageBadge.details, disclaimer: 'Host page badge \u00b7 not independently verified'
        }, history);
      } else if (status?.label === 'UNKNOWN DEV') {
        render(assessment, {
          tone: 'neutral', category: 'UNKNOWN DEV',
          summary: status.reasons[0] ?? 'Scout could not verify this developer.',
          reasons: status.reasons, disclaimer: 'Creator identity and launch history are unverified.'
        }, history);
      } else if (status?.label === 'GOOD DEV') {
        render(assessment, {
          tone: 'green', category: 'GOOD DEV',
          summary: 'Verified creator with no rapid failures or linked selling, and no configured critical risk detected. This is not a guarantee of safety.',
          reasons: status.reasons, disclaimer: 'Evidence-based check \u00b7 not investment advice'
        }, history);
      } else {
        render(assessment, {
          tone: 'green', category: 'NO CRITICAL RISK FLAGGED',
          summary: 'No configured critical risk was detected in the available data. This is not a guarantee of safety.',
          reasons: assessment?.positives.slice(0, 3) ?? [], disclaimer: 'Evidence-based check \u00b7 not investment advice'
        }, history);
      }
    },
    destroy(): void {
      detachFrame?.();
      detachFrame = null;
      resizeHandle = null;
      panel?.remove();
      panel = null;
      dismissedMint = null;
    }
  };
}
