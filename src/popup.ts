import { fetchTokens } from './provider.js';
import { fetchTrackedTokens, loadTrackedMints } from './dex.js';
import { assessTokens } from './analysis.js';
import { saveSignals } from './signalStore.js';
import { enrichTokensWithGoPlus } from './goplus.js';
import { loadPulseStatus } from './pulseStatus.js';
import { checkActiveWebsite } from './siteCheck.js';
import { popupCoinRow } from './tokenCard.js';
import { coinDetail } from './coinDetail.js';
import { escapeHtml as e, bindCoinImages, bindCopyButtons, loadProviderMode, loadSettings } from './ui.js';
import { filterByPlatform, loadPlatformFilter, platformCatalogue, savePlatformFilter, togglePlatform } from './platformFilter.js';
import { filterByQuote, loadQuoteFilter, quoteOptions, saveQuoteFilter, toggleQuote } from './quoteFilter.js';
import { bindProtocolPicker, platformPickerIds, protocolPicker, quotePickerIds } from './protocolPicker.js';
import type { Assessment, Settings } from './types.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Popup root missing');
const app = root;
let request = 0;
let siteMint = '';
let siteResult = '';
/** Latest observation set, so opening a coin never needs another round of lookups. */
let latest: { assessments: Assessment[]; settings: Settings; mode: 'live'; pulseText: string } | null = null;
let selectedMint: string | null = null;
/** Launchpad filter, shared with the dashboard through local storage. */
let platforms = loadPlatformFilter();
let platformsExpanded = false;
/** Quote-token filter, also shared with the dashboard. */
let quotes = loadQuoteFilter();

function websiteCheckSection(): string {
  return `<details class="popup-website"><summary>Check this website's token address</summary><p>Open a coin's HTTPS website, click Scout, then paste the full Solana mint. Scout checks only what this page visibly shows now.</p><form id="site-check-form"><input id="site-check-mint" type="text" spellcheck="false" autocomplete="off" aria-label="Token mint to check on this website" placeholder="Paste full Solana mint" value="${e(siteMint)}"><button class="subtle" type="submit">Check exact address</button></form><p id="site-check-result" class="muted" role="status">${e(siteResult)}</p></details>`;
}

function frame(content: string): void {
  app.innerHTML = `<div class="popup-wrap"><header class="popup-head"><div class="header-end"><span class="mark" aria-label="Scout"><img src="scout-raccoon-logo.png" alt="Scout raccoon logo" width="36" height="36"></span></div><div class="header-copy"><span class="header-kicker">SOLANA / LIVE</span><strong>Market radar</strong></div></header>${content}${websiteCheckSection()}<button id="open-companion" class="primary wide">Open compact companion</button><button id="open-dashboard" class="subtle wide">Open full dashboard</button><p class="popup-foot">Scores are research aids, not trade instructions.</p></div>`;
  app.querySelector<HTMLButtonElement>('#open-dashboard')?.addEventListener('click', () => { window.open('dashboard.html', '_blank', 'noopener'); });
  app.querySelector<HTMLButtonElement>('#open-companion')?.addEventListener('click', () => { window.open('dashboard.html', 'scout-companion', 'popup,width=520,height=820'); });
  app.querySelectorAll<HTMLElement>('.coin-row[data-mint]').forEach(row => row.addEventListener('click', () => {
    selectedMint = row.dataset.mint ?? null;
    paint();
  }));
  app.querySelector<HTMLButtonElement>('#back-to-list')?.addEventListener('click', () => { selectedMint = null; paint(); });
  bindProtocolPicker(app, {
    onToggle: id => {
      platforms = id ? togglePlatform(platforms, id) : [];
      savePlatformFilter(platforms);
      paint();
    },
    onToggleMore: () => { platformsExpanded = !platformsExpanded; paint(); }
  }, { ids: platformPickerIds });
  bindProtocolPicker(app, {
    onToggle: id => {
      quotes = id ? toggleQuote(quotes, id) : [];
      saveQuoteFilter(quotes);
      paint();
    },
    onToggleMore: () => { /* the quote list is fixed and short, so it never expands */ }
  }, { ids: quotePickerIds, dataAttribute: 'data-quote' });
  bindCoinImages(app);
  bindCopyButtons(app);
  app.querySelector<HTMLInputElement>('#site-check-mint')?.addEventListener('input', event => { siteMint = (event.target as HTMLInputElement).value.trim(); });
  app.querySelector<HTMLFormElement>('#site-check-form')?.addEventListener('submit', event => {
    event.preventDefault();
    siteMint = app.querySelector<HTMLInputElement>('#site-check-mint')?.value.trim() ?? '';
    siteResult = 'Checking this page...';
    const output = app.querySelector<HTMLElement>('#site-check-result');
    if (output) output.textContent = siteResult;
    void checkActiveWebsite(siteMint).then(result => {
      const host = new URL(result.origin).hostname;
      siteResult = result.found
        ? `Exact address visible on ${host} now. This does not prove it appeared before launch or that the coin is safe.`
        : `Exact address not found in visible text on ${host}. This is not a full site audit.`;
      const current = app.querySelector<HTMLElement>('#site-check-result');
      if (current) current.textContent = siteResult;
    }, cause => {
      siteResult = cause instanceof Error ? cause.message : 'Website check failed.';
      const current = app.querySelector<HTMLElement>('#site-check-result');
      if (current) current.textContent = siteResult;
    });
  });
}

async function render(): Promise<void> {
  const currentRequest = ++request;
  const mode = loadProviderMode();
  frame('<p class="muted">Loading live observations…</p>');
  try {
    const now = Date.now();
    const settings = loadSettings();
    const mints = loadTrackedMints();
    const [feed, tracked, pulse] = await Promise.allSettled([fetchTokens(mode, now), fetchTrackedTokens(mints, now), loadPulseStatus(now)]);
    if (currentRequest !== request) return;
    if (feed.status === 'rejected' && (tracked.status === 'rejected' || tracked.value.tokens.length === 0)) throw feed.reason;
    const marketTokens = [...(feed.status === 'fulfilled' ? feed.value : []), ...(tracked.status === 'fulfilled' ? tracked.value.tokens : [])];
    const tokens = await enrichTokensWithGoPlus(marketTokens, now, mints);
    if (currentRequest !== request) return;
    const assessments = assessTokens(tokens, settings, now, new Set(mints));
    saveSignals(mode, assessments, now);
    const pulseState = pulse.status === 'fulfilled' ? pulse.value : null;
    const pulseText = pulseState?.onPulse
      ? `Pulse · ${pulseState.colouredRows}/${pulseState.visibleRows} rows coloured · ${pulseState.matchedRows} exact mints · ${Math.max(0, Math.round((now - pulseState.at) / 1000))}s ago`
      : 'Open Axiom Pulse to start row highlights.';
    latest = { assessments, settings, mode, pulseText };
    paint();
  } catch (cause) {
    if (currentRequest !== request) return;
    latest = null;
    frame(`<h1>Live feed unavailable</h1><p class="error" role="alert">${e(cause instanceof Error ? cause.message : 'Unable to load observations')}</p><p class="muted">Try again shortly. The page highlighter can keep running while this popup is closed.</p>`);
  }
}

/** List of observations, or the clicked coin's card when one is open. */
function paint(): void {
  if (!latest) return;
  const { assessments, settings, mode, pulseText } = latest;
  const open = selectedMint ? assessments.find(a => a.token.mint === selectedMint) ?? null : null;
  if (!open) selectedMint = null;
  const launchpads = platformCatalogue(assessments);
  const visible = filterByQuote(filterByPlatform(assessments, platforms), quotes);
  const launchpadFilter = protocolPicker({ items: launchpads, selected: platforms, expanded: platformsExpanded, compact: true, heading: 'Launchpads' });
  const quoteFilter = protocolPicker({
    items: quoteOptions(assessments), selected: quotes, expanded: true, compact: true, dense: true,
    heading: 'Quote tokens', ids: quotePickerIds, expander: false, allLabel: 'quote tokens', dataAttribute: 'data-quote'
  });
  const content = open
    ? `<div class="popup-detail-head"><button id="back-to-list" class="subtle" type="button">← All coins</button><h2>Coin detail</h2></div><div class="popup-detail">${coinDetail(open, { mode, settings, compact: true })}</div>`
    : `<h1>Live scan</h1><p class="muted">Independent Solana pool data.</p><p class="muted popup-pulse-state">${e(pulseText)}</p><div class="popup-stats"><div><small>Scanned</small><strong>${assessments.length}</strong></div><div><small>Top picks</small><strong>${assessments.filter(a => a.status === 'TOP CANDIDATE').length}</strong></div><div><small>Risk</small><strong>${assessments.filter(a => a.status === 'HIGH RISK' || a.status === 'DISQUALIFIED').length}</strong></div></div><h2>Recent coins</h2><p class="muted popup-hint">Select a coin for the full evidence card.</p>${launchpadFilter}${quoteFilter}<div class="popup-list">${visible.slice(0, 4).map(a => popupCoinRow(a, { settings, mode })).join('') || '<p class="muted">No coins match these filters.</p>'}</div>`;
  frame(content);
}
void render();
