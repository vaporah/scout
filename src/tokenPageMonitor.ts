import { loadCoinHistory, mergeVampirePools, summarizeHistory, type TokenHistoryView } from './coinHistory.js';
import type { ScanResponse } from './messages.js';
import { createRiskOverlay, type PageDevBadge } from './riskOverlay.js';
import { defaults, validSettings } from './settings.js';
import type { Assessment } from './types.js';

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
  const refreshMs = Math.max(5_000, options.refreshMs ?? 15_000);
  let checkTimer: ReturnType<typeof setInterval> | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let active = false;
  let lastMint: string | null = null;
  let inFlight = false;

  const href = (): string => {
    try { return doc.defaultView?.location.href ?? doc.URL ?? ''; }
    catch { return doc.URL ?? ''; }
  };

  async function refresh(force = false): Promise<void> {
    if (!active || inFlight) return;
    const mint = parseMint(href());
    if (mint === lastMint && !force) return;
    if (!mint) {
      lastMint = null;
      overlay.update(null, defaults);
      return;
    }
    lastMint = mint;
    inFlight = true;
    try {
      const response = await request([mint]);
      const settings = validSettings(response?.settings);
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
      if (!active || parseMint(href()) !== mint) return;
      if (assessment || badge) overlay.update(assessment, settings, badge, history);
      // A full mint with no verdict used to hide the popup entirely, which looks
      // exactly like Scout being broken. Say what happened instead.
      else overlay.showUnscanned(mint, unscannedReason(response?.errors));
    } catch (cause) {
      if (active && parseMint(href()) === lastMint) overlay.showUnscanned(mint, scanFailureReason(cause));
    } finally {
      inFlight = false;
    }
  }

  function start(): void {
    if (active) return;
    active = true;
    void refresh(true);
    checkTimer = setInterval(() => void refresh(), 1_500);
    refreshTimer = setInterval(() => void refresh(true), refreshMs);
    doc.defaultView?.addEventListener('popstate', () => void refresh(true));
    doc.defaultView?.addEventListener('hashchange', () => void refresh(true));
  }

  function stop(): void {
    active = false;
    if (checkTimer !== null) clearInterval(checkTimer);
    if (refreshTimer !== null) clearInterval(refreshTimer);
    checkTimer = refreshTimer = null;
    doc.defaultView?.removeEventListener('popstate', () => void refresh(true));
    doc.defaultView?.removeEventListener('hashchange', () => void refresh(true));
    overlay.destroy();
  }

  return { start, stop };
}
