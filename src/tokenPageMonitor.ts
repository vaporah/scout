import { loadCoinHistory, mergeVampirePools, summarizeHistory, type TokenHistoryView } from './coinHistory.js';
import type { ScanResponse } from './messages.js';
import { createRiskOverlay, type PageDevBadge } from './riskOverlay.js';
import { defaults, validSettings } from './settings.js';
import type { Assessment } from './types.js';
import { loadIntegrationPrefs, watchIntegrationPrefs } from './integrationPrefs.js';

export interface TokenPageMonitorOptions {
  document?: Document;
  explorerUrl?: (mint: string) => string;
  accountUrl?: (wallet: string) => string;
  /** How often to re-request the same token's assessment. */
  refreshMs?: number;
  /** Reads the host page's developer provenance badge (for example Axiom PROVEN DEV). */
  pageBadge?: () => PageDevBadge | null;
}

/**
 * Turn the scan's own error list into something a person can read. The errors name
 * the mint as `abc123...xyz9: market lookup unavailable.`, which is useful in a log
 * and noise in a popup, so the mint prefix is stripped and the sentence is cased.
 */
function unscannedReason(errors: string[] | undefined): string {
  const first = Array.isArray(errors) ? errors.find(Boolean) : undefined;
  if (!first) return '';
  const detail = first
    .replace(/^[1-9A-HJ-NP-Za-km-z]{4,6}(?:\.{3}|\u2026)[1-9A-HJ-NP-Za-km-z]{3,6}:\s*/, '')
    .trim();
  if (!detail) return '';
  return `Scout has no independent data for this mint yet. ${detail.charAt(0).toUpperCase()}${detail.slice(1)}`;
}

/**
 * Explain a failed scan in terms of what the person can do about it. "Could not reach
 * its scanner" was shown for every failure, which hid the two that are actually
 * actionable: a reloaded extension leaving this tab's content script orphaned, and a
 * scan that is simply still running.
 */
function scanFailureReason(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause ?? '');
  if (/context invalidated|receiving end does not exist|could not establish connection|message port closed/i.test(message)) {
    return 'Scout was updated or reloaded, so this tab is still running the old copy. Refresh this page to reconnect.';
  }
  if (/timed out/i.test(message)) {
    return 'Scout is still gathering data for this mint. It keeps trying while this page stays open, and fills this in as soon as a lookup returns.';
  }
  return 'Scout could not reach its scanner just now. It keeps retrying while this page stays open.';
}

/**
 * Watches a token-page URL for mint changes and keeps the risk overlay in sync
 * with the shared mint-keyed assessment engine. Works for SPA navigation: a
 * cheap location poll detects token switches, a slower timer refreshes data.
 */
export function startTokenPageMonitor(
  parseMint: (href: string) => string | null,
  request: (mints: string[]) => Promise<ScanResponse>,
  options: TokenPageMonitorOptions = {}
) {
  const doc = options.document ?? document;
  const overlay = createRiskOverlay({ document: doc, explorerUrl: options.explorerUrl, accountUrl: options.accountUrl });
  const fixedRefreshMs = options.refreshMs === undefined ? null : Math.max(5_000, options.refreshMs);
  let refreshMs = fixedRefreshMs ?? defaults.refreshSeconds * 1000;
  let checkTimer: ReturnType<typeof setInterval> | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let active = false;
  let lastMint: string | null = null;
  let inFlight = false;
  let missingSince = 0;
  let lastMintHref = '';
  let popupEnabled = true;
  let unwatchPrefs: (() => void) | null = null;
  const identityGraceMs = 6_000;

  const href = (): string => {
    try { return doc.defaultView?.location.href ?? doc.URL ?? ''; }
    catch { return doc.URL ?? ''; }
  };

  async function refresh(force = false): Promise<void> {
    if (!active) return;
    const mint = parseMint(href());
    doc.documentElement?.toggleAttribute('data-scout-coin-page', mint !== null);
    if (!popupEnabled) {
      overlay.update(null, defaults);
      return;
    }
    if (mint === lastMint && !force) {
      overlay.ensureAttached();
      return;
    }
    if (!mint) {
      if (lastMint && href() === lastMintHref) {
        if (!missingSince) missingSince = Date.now();
        if (Date.now() - missingSince < identityGraceMs) return;
      }
      lastMint = null;
      missingSince = 0;
      overlay.update(null, defaults);
      return;
    }
    // Navigation must always be processed above, even while the former coin's
    // request is unresolved. Only starting another request is blocked here.
    if (inFlight) return;
    const tokenChanged = mint !== lastMint;
    missingSince = 0;
    lastMintHref = href();
    lastMint = mint;
    // A fresh chart used to stay completely blank until every provider answered.
    // On new launches that can take several seconds and looks identical to a missing
    // content script. Mount the panel immediately so Axiom and GMGN always acknowledge
    // the active coin, then replace this state with the assessment or exact failure.
    if (tokenChanged) overlay.showUnscanned(mint, 'Scout is gathering independent market, holder, and security data for this coin.');
    inFlight = true;
    try {
      const response = await request([mint]);
      const settings = validSettings(response?.settings);
      if (fixedRefreshMs === null) refreshMs = settings.refreshSeconds * 1000;
      const returned: Assessment[] = Array.isArray(response?.assessments) ? response.assessments : [];
      // Prefer the exact mint. Falling back to the single answer matters because a token
      // page may ask about a pool address, and the token it resolves to has its own mint.
      const assessment: Assessment | null = returned.find(item => item.token.mint === mint)
        ?? (returned.length === 1 ? returned[0] ?? null : null);
      const badge = options.pageBadge?.() ?? null;
      let history: TokenHistoryView | null = null;
      if (assessment) {
        try {
          const view = summarizeHistory(await loadCoinHistory(), assessment.token, response?.ath ?? null);
          // The scan also reports other Solana pools on this ticker, so the popup can
          // answer the vampire question even before Scout has seen the other coins.
          history = mergeVampirePools(view, { pools: response?.vamps ?? [], feedChecked: response?.vamps !== undefined, excludeMint: assessment.token.mint });
        } catch { history = null; }
      }
      // Only paint if the page still shows this exact token.
      const currentMint = parseMint(href());
      if (!active || currentMint !== mint) return;
      if (assessment || badge) overlay.update(assessment, settings, badge, history);
      // A full mint with no verdict used to hide the popup entirely, which looks
      // exactly like Scout being broken. Say what happened instead.
      else overlay.showUnscanned(mint, unscannedReason(response?.errors));
    } catch (cause) {
      const currentMint = parseMint(href());
      if (active && currentMint === mint) overlay.showUnscanned(mint, scanFailureReason(cause));
    } finally {
      inFlight = false;
    }
  }

  function scheduleRefresh(): void {
    if (!active) return;
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refresh(true).finally(scheduleRefresh);
    }, Math.max(10_000, refreshMs));
  }

  const onRouteChange = (): void => { void refresh(true); };

  function start(): void {
    if (active) return;
    active = true;
    unwatchPrefs = watchIntegrationPrefs(prefs => {
      popupEnabled = prefs.coinPopups;
      if (popupEnabled) void refresh(true);
      else overlay.update(null, defaults);
    });
    void loadIntegrationPrefs().then(prefs => {
      popupEnabled = prefs.coinPopups;
      if (popupEnabled) void refresh(true);
      else overlay.update(null, defaults);
    });
    checkTimer = setInterval(() => void refresh(), 1_500);
    scheduleRefresh();
    void refresh();
    doc.defaultView?.addEventListener('popstate', onRouteChange);
    doc.defaultView?.addEventListener('hashchange', onRouteChange);
  }

  function stop(): void {
    active = false;
    doc.documentElement?.removeAttribute('data-scout-coin-page');
    overlay.update(null, defaults);
    if (checkTimer !== null) clearInterval(checkTimer);
    if (refreshTimer !== null) clearTimeout(refreshTimer);
    checkTimer = refreshTimer = null;
    unwatchPrefs?.();
    unwatchPrefs = null;
    doc.defaultView?.removeEventListener('popstate', onRouteChange);
    doc.defaultView?.removeEventListener('hashchange', onRouteChange);
    overlay.destroy();
  }

  return { start, stop };
}
