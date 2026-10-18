import { fetchTokens, resetProviderCache } from './provider.js';
import { enrichTokenImages, fetchMint, fetchTrackedTokens, loadTrackedMints, resetMintCache } from './dex.js';
import { assessTokens } from './analysis.js';
import { saveSignals } from './signalStore.js';
import { enrichTokensWithGoPlus } from './goplus.js';
import { loadPulseStatus } from './pulseStatus.js';
import { checkActiveWebsite } from './siteCheck.js';
import { popupCoinRow } from './tokenCard.js';
import { coinDetail } from './coinDetail.js';
import { escapeHtml as e, bindCoinImages, bindCopyButtons, loadProviderMode, loadSettings, safeImageUrl, saveSettings } from './ui.js';
import { defaults, validSettings } from './settings.js';
import { filterByPlatform, loadPlatformFilter, platformCatalogue, savePlatformFilter, togglePlatform } from './platformFilter.js';
import { filterByQuote, loadQuoteFilter, quoteOptions, saveQuoteFilter, toggleQuote } from './quoteFilter.js';
import { bindProtocolPicker, platformPickerIds, protocolPicker, quotePickerIds } from './protocolPicker.js';
import type { Assessment, Settings } from './types.js';
import { clearWalletList, exportWalletList, loadWalletList, parseWalletList, saveWalletList, type TrackedWallet } from './walletList.js';
import { defaultIntegrationPrefs, loadIntegrationPrefs, saveIntegrationPrefs, type IntegrationPrefs } from './integrationPrefs.js';
import { tradingPageIdentity, type TradingPageIdentity } from './tradingPage.js';

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
let filtersExpanded = false;
/** Quote-token filter, also shared with the dashboard. */
let quotes = loadQuoteFilter();
let popupTab: 'scan' | 'settings' = 'scan';
let refreshTimer: number | undefined;
let walletCount = 0;
let developerWalletCount = 0;
let walletStatus = '';
let walletDialogOpen = false;
let walletDraft = '';
let walletsCache: TrackedWallet[] = [];
let integrationPrefs: IntegrationPrefs = defaultIntegrationPrefs;

interface PopupBrowserApi {
  tabs?: { query(query: { active: true; currentWindow: true }): Promise<Array<{ url?: string }>> };
}

async function activeTradingPage(): Promise<TradingPageIdentity | null> {
  try {
    const api = (globalThis as typeof globalThis & { chrome?: PopupBrowserApi }).chrome;
    const [tab] = await api?.tabs?.query({ active: true, currentWindow: true }) ?? [];
    return tab?.url ? tradingPageIdentity(tab.url) : null;
  } catch { return null; }
}

function restartAutoRefresh(settings = loadSettings()): void {
  if (refreshTimer !== undefined) window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(() => { void render(); }, settings.refreshSeconds * 1000);
}

const settingInput = (name: keyof Settings, label: string, value: number, min: number, max: number, step: number): string =>
  `<label><span>${e(label)}</span><input data-popup-setting="${name}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;

function websiteCheckSection(): string {
  return `<details class="popup-website"><summary>Check this website's token address</summary><p>Open a coin's HTTPS website, click Scout, then paste the full Solana mint. Scout checks only what this page visibly shows now.</p><form id="site-check-form"><input id="site-check-mint" type="text" spellcheck="false" autocomplete="off" aria-label="Token mint to check on this website" placeholder="Paste full Solana mint" value="${e(siteMint)}"><button class="subtle" type="submit">Check exact address</button></form><p id="site-check-result" class="muted" role="status">${e(siteResult)}</p></details>`;
}

function settingsView(settings: Settings): string {
  const walletSummary = walletCount ? `${walletCount.toLocaleString()} wallets · ${developerWalletCount} labelled dev` : 'No wallet list imported';
  const dialog = walletDialogOpen ? `<div class="wallet-dialog-backdrop"><section class="wallet-dialog" role="dialog" aria-modal="true" aria-labelledby="wallet-dialog-title"><header><strong id="wallet-dialog-title">Import wallets</strong><button id="close-wallet-dialog" class="wallet-dialog-close" type="button" aria-label="Close">×</button></header><div class="wallet-dialog-body"><textarea id="wallet-json" spellcheck="false" placeholder="Paste your exported wallets here…">${e(walletDraft)}</textarea><p class="muted">Paste Scout or Axiom wallet JSON. Wallet groups are ignored and duplicate addresses are removed.</p><label class="subtle wide popup-wallet-import">Choose JSON file<input id="wallet-file" type="file" accept="application/json,.json,.txt"></label><p id="wallet-dialog-status" class="popup-settings-status" role="status">${e(walletStatus)}</p></div><footer><button id="confirm-wallet-import" type="button">Import wallets</button></footer></section></div>` : '';
  const featureToggle = (name: keyof IntegrationPrefs, title: string, description: string): string => {
    const enabled = integrationPrefs[name];
    return `<label class="popup-feature-toggle"><span><b>${e(title)}</b><small>${e(description)}</small></span><span class="popup-feature-control"><em>${enabled ? 'ON' : 'OFF'}</em><input aria-label="${e(title)}" data-integration-pref="${name}" type="checkbox" ${enabled ? 'checked' : ''}></span></label>`;
  };
  return `<section class="popup-settings"><div class="popup-settings-head"><div><h1>Scanner settings</h1><p class="muted">These thresholds change Scout's research labels. They never place trades.</p></div><button id="reset-popup-settings" class="subtle" type="button">Reset</button></div><div class="popup-integration-settings"><strong>Trading-page display</strong>${featureToggle('coinPopups', 'Coin information panels', 'Show Scout research on coin pages and when hovering token rows.')}${featureToggle('rowHighlights', 'Token row highlights', 'Colour supported Axiom Pulse and GMGN list rows.')}</div><div class="popup-setting-grid">${settingInput('minLiquidityUsd', 'Minimum liquidity ($)', settings.minLiquidityUsd, 0, 1_000_000, 1000)}${settingInput('maxSlippagePct', 'Max estimated impact (%)', settings.maxSlippagePct, 0.1, 20, 0.1)}${settingInput('tradeSizeUsd', 'Sample trade ($)', settings.tradeSizeUsd, 1, 100_000, 1)}${settingInput('minScore', 'Top-candidate score', settings.minScore, 0, 100, 1)}${settingInput('maxAgeHours', 'Maximum age (hours)', settings.maxAgeHours, 1, 720, 1)}${settingInput('refreshSeconds', 'Refresh interval (seconds)', settings.refreshSeconds, 10, 300, 1)}</div><label class="popup-toggle"><input id="popup-notifications" type="checkbox" ${settings.notifications ? 'checked' : ''}><span>Enable research notifications</span></label><div class="popup-wallets"><strong>Tracked wallets</strong><p class="muted">${e(walletSummary)}. One flat list, stored only in this browser.</p><div class="popup-wallet-actions"><button id="open-wallet-import" class="subtle" type="button">Import</button><button id="export-wallets" class="subtle" type="button" ${walletCount ? '' : 'disabled'}>Export</button></div>${walletCount ? '<button id="clear-wallets" class="subtle wide" type="button">Remove all</button>' : ''}<p id="wallet-status" class="popup-settings-status" role="status">${e(walletStatus)}</p></div><p id="popup-settings-status" class="popup-settings-status" role="status">Changes are saved locally and apply immediately.</p><button id="open-dashboard" class="subtle wide" type="button">Open full dashboard</button></section>${dialog}`;
}

function walletsFromDraft(raw: string): TrackedWallet[] {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('The pasted wallet data is not valid JSON.'); }
  const wallets = parseWalletList(parsed);
  if (!wallets.length) throw new Error('No valid Solana wallet addresses were found.');
  return wallets;
}

function adoptWallets(wallets: TrackedWallet[], message: string): void {
  walletsCache = wallets;
  walletCount = wallets.length;
  developerWalletCount = wallets.filter(wallet => wallet.developer).length;
  walletStatus = message;
}

function frame(content: string): void {
  const settings = latest?.settings ?? loadSettings();
  const tabs = `<div class="popup-tabs" role="tablist" aria-label="Scout popup sections"><button id="tab-scan" class="popup-tab ${popupTab === 'scan' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${popupTab === 'scan'}">Scan</button><button id="tab-settings" class="popup-tab ${popupTab === 'settings' ? 'is-active' : ''}" type="button" role="tab" aria-selected="${popupTab === 'settings'}">Settings</button></div>`;
  const body = popupTab === 'settings' ? settingsView(settings) : `${content}${websiteCheckSection()}`;
  app.innerHTML = `<div class="popup-wrap"><header class="popup-head"><div class="header-end"><span class="mark" aria-label="Scout"><img src="scout-raccoon-logo.png" alt="Scout raccoon logo" width="36" height="36"></span></div><div class="header-copy"><span class="header-kicker">SOLANA INTELLIGENCE</span><strong>Scout</strong></div>${tabs}</header>${body}<p class="popup-foot">Independent research only · No wallet access · No trades</p></div>`;
  app.querySelectorAll<HTMLElement>('.popup-feature-toggle small').forEach(description => {
    if (description.textContent?.includes('Axiom Pulse and GMGN'))
      description.textContent = 'Colour supported Axiom, GMGN, and Padre token lists.';
  });
  app.querySelector<HTMLButtonElement>('#tab-scan')?.addEventListener('click', () => { popupTab = 'scan'; paint(); });
  app.querySelector<HTMLButtonElement>('#tab-settings')?.addEventListener('click', () => { popupTab = 'settings'; paint(); });
  app.querySelector<HTMLButtonElement>('#quick-settings')?.addEventListener('click', () => { popupTab = 'settings'; paint(); });
  app.querySelector<HTMLButtonElement>('#open-dashboard')?.addEventListener('click', () => { window.open('dashboard.html', '_blank', 'noopener'); });
  app.querySelector<HTMLButtonElement>('#refresh-popup')?.addEventListener('click', () => {
    resetProviderCache();
    resetMintCache();
    void render();
  });
  app.querySelector<HTMLButtonElement>('#reset-popup-settings')?.addEventListener('click', () => {
    if (latest) latest.settings = defaults;
    saveSettings(defaults);
    restartAutoRefresh(defaults);
    paint();
  });
  app.querySelectorAll<HTMLInputElement>('[data-popup-setting]').forEach(input => input.addEventListener('change', () => {
    const value = Number(input.value);
    if (!Number.isFinite(value)) { paint(); return; }
    const current = latest?.settings ?? loadSettings();
    const next = validSettings({ ...current, [input.dataset.popupSetting ?? '']: value });
    if (latest) latest.settings = next;
    saveSettings(next);
    restartAutoRefresh(next);
    const status = app.querySelector<HTMLElement>('#popup-settings-status');
    if (status) status.textContent = 'Saved. New scans use these thresholds.';
  }));
  app.querySelector<HTMLInputElement>('#popup-notifications')?.addEventListener('change', event => {
    const current = latest?.settings ?? loadSettings();
    const next = validSettings({ ...current, notifications: (event.target as HTMLInputElement).checked });
    if (latest) latest.settings = next;
    saveSettings(next);
    const status = app.querySelector<HTMLElement>('#popup-settings-status');
    if (status) status.textContent = 'Saved. Notifications remain research alerts only.';
  });
  app.querySelectorAll<HTMLInputElement>('[data-integration-pref]').forEach(input => input.addEventListener('change', () => {
    const name = input.dataset.integrationPref as keyof IntegrationPrefs;
    integrationPrefs = { ...integrationPrefs, [name]: input.checked };
    const state = input.closest('.popup-feature-control')?.querySelector('em');
    if (state) state.textContent = input.checked ? 'ON' : 'OFF';
    void saveIntegrationPrefs(integrationPrefs);
    const status = app.querySelector<HTMLElement>('#popup-settings-status');
    if (status) status.textContent = 'Saved. Open trading tabs update immediately.';
  }));
  app.querySelector<HTMLButtonElement>('#open-wallet-import')?.addEventListener('click', () => {
    walletDialogOpen = true;
    walletStatus = 'Paste wallet JSON, or allow Scout to read the copied JSON.';
    paint();
    const readClipboard = navigator.clipboard?.readText?.bind(navigator.clipboard);
    if (!readClipboard) { app.querySelector<HTMLTextAreaElement>('#wallet-json')?.focus(); return; }
    void readClipboard().then(raw => {
      if (!raw.trim() || !parseWalletList((() => { try { return JSON.parse(raw); } catch { return null; } })()).length) return;
      walletDraft = raw;
      walletStatus = 'Wallet JSON detected on your clipboard.';
      paint();
      app.querySelector<HTMLTextAreaElement>('#wallet-json')?.focus();
    }).catch(() => { app.querySelector<HTMLTextAreaElement>('#wallet-json')?.focus(); });
  });
  app.querySelector<HTMLButtonElement>('#close-wallet-dialog')?.addEventListener('click', () => {
    walletDialogOpen = false;
    walletStatus = '';
    paint();
  });
  app.querySelector<HTMLTextAreaElement>('#wallet-json')?.addEventListener('input', event => {
    walletDraft = (event.target as HTMLTextAreaElement).value;
  });
  app.querySelector<HTMLInputElement>('#wallet-file')?.addEventListener('change', event => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    void file.text().then(raw => {
      walletDraft = raw;
      walletStatus = 'File loaded. Select Import wallets to finish.';
      paint();
    }, cause => {
      walletStatus = cause instanceof Error ? cause.message : 'Could not read that file.';
      paint();
    });
  });
  app.querySelector<HTMLButtonElement>('#confirm-wallet-import')?.addEventListener('click', () => {
    walletDraft = app.querySelector<HTMLTextAreaElement>('#wallet-json')?.value ?? walletDraft;
    try {
      const wallets = walletsFromDraft(walletDraft);
      void saveWalletList(wallets).then(() => {
        adoptWallets(wallets, `Imported ${wallets.length.toLocaleString()} wallets into one flat list.`);
        walletDialogOpen = false;
        walletDraft = '';
        paint();
      });
    } catch (cause) {
      walletStatus = cause instanceof Error ? cause.message : 'Wallet import failed.';
      paint();
    }
  });
  app.querySelector<HTMLButtonElement>('#export-wallets')?.addEventListener('click', () => {
    const payload = exportWalletList(walletsCache);
    const writeClipboard = navigator.clipboard?.writeText?.bind(navigator.clipboard);
    const fallback = (): void => {
      walletDialogOpen = true;
      walletDraft = payload;
      walletStatus = 'Clipboard access was blocked. Copy the JSON below.';
      paint();
      app.querySelector<HTMLTextAreaElement>('#wallet-json')?.select();
    };
    if (!writeClipboard) { fallback(); return; }
    void writeClipboard(payload).then(() => {
      walletStatus = `Copied ${walletCount.toLocaleString()} wallets. Paste them anywhere.`;
      paint();
    }, fallback);
  });
  app.querySelector<HTMLButtonElement>('#clear-wallets')?.addEventListener('click', () => {
    void clearWalletList().then(() => {
      walletsCache = [];
      walletCount = developerWalletCount = 0;
      walletStatus = 'Wallet list cleared.';
      paint();
    });
  });
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
  app.querySelector<HTMLDetailsElement>('.popup-filters')?.addEventListener('toggle', event => {
    filtersExpanded = (event.currentTarget as HTMLDetailsElement).open;
  });
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
    const activePage = await activeTradingPage();
    const [feed, tracked, pulse, activeToken] = await Promise.allSettled([
      fetchTokens(mode, now), fetchTrackedTokens(mints, now), loadPulseStatus(now),
      activePage ? fetchMint(activePage.mint, now, true) : Promise.resolve(null)
    ]);
    if (currentRequest !== request) return;
    const pulseState = pulse.status === 'fulfilled' ? pulse.value : null;
    const trenchTokens = pulseState?.onPulse && pulseState.assessments?.length
      ? pulseState.assessments.map(assessment => assessment.token)
      : null;
    const pageToken = activeToken.status === 'fulfilled' ? activeToken.value : null;
    const marketTokens = [pageToken, ...(trenchTokens ?? (feed.status === 'fulfilled' ? feed.value : [])), ...(tracked.status === 'fulfilled' ? tracked.value.tokens : [])]
      .filter((token): token is NonNullable<typeof token> => token !== null)
      .map(token => {
        const rowImage = safeImageUrl(pulseState?.coinImages?.[token.mint]);
        return token.imageUrl === null && rowImage ? { ...token, imageUrl: rowImage } : token;
      });
    const [securedTokens, picturedTokens] = await Promise.all([
      enrichTokensWithGoPlus(marketTokens, now, mints),
      enrichTokenImages(marketTokens, now)
    ]);
    const pictures = new Map(picturedTokens.map(token => [token.mint, token.imageUrl]));
    const tokens = securedTokens.map(token => token.imageUrl === null && pictures.get(token.mint)
      ? { ...token, imageUrl: pictures.get(token.mint) ?? null }
      : token);
    if (currentRequest !== request) return;
    const assessments = assessTokens(tokens, settings, now, new Set(mints));
    saveSignals(mode, assessments, now);
    const feedProblem = feed.status === 'rejected'
      ? feed.reason instanceof Error ? feed.reason.message : 'Live feed temporarily unavailable.'
      : '';
    const pulseText = pageToken && activePage ? `Current ${activePage.platform} coin · exact page address` : pulseState?.onPulse
      ? `Trenches · ${pulseState.colouredRows}/${pulseState.visibleRows} rows coloured · ${pulseState.matchedRows} exact mints · ${Math.max(0, Math.round((now - pulseState.at) / 1000))}s ago`
      : feedProblem || 'Open Axiom Pulse, GMGN Trenches, or Padre Trenches to start row highlights.';
    latest = { assessments, settings, mode, pulseText };
    if (pageToken && assessments.some(assessment => assessment.token.mint === pageToken.mint)) selectedMint = pageToken.mint;
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
  if (popupTab === 'settings') { frame(''); return; }
  const open = selectedMint ? assessments.find(a => a.token.mint === selectedMint) ?? null : null;
  if (!open) selectedMint = null;
  const launchpads = platformCatalogue(assessments);
  const visible = filterByQuote(filterByPlatform(assessments, platforms), quotes);
  const launchpadFilter = protocolPicker({ items: launchpads, selected: platforms, expanded: platformsExpanded, compact: true, visibleLimit: 4, heading: 'Launchpads' });
  const quoteFilter = protocolPicker({
    items: quoteOptions(assessments), selected: quotes, expanded: true, compact: true, dense: true,
    heading: 'Quote tokens', ids: quotePickerIds, expander: false, allLabel: 'quote tokens', dataAttribute: 'data-quote'
  });
  const content = open
    ? `<div class="popup-detail-head"><button id="back-to-list" class="subtle" type="button">← All coins</button><h2>Coin detail</h2></div><div class="popup-detail">${coinDetail(open, { mode, settings, compact: true })}</div>`
    : `<section class="popup-overview popup-overview--compact"><div class="popup-scan-head"><div><span class="popup-eyebrow">Live scan · auto refresh ${settings.refreshSeconds}s</span><h1>Trenches</h1></div><button id="refresh-popup" class="subtle" type="button">Refresh</button></div><p class="muted popup-pulse-state"><span class="live-dot" aria-hidden="true"></span>${e(pulseText)}</p><div class="popup-stats"><div><small>Scanned</small><strong>${assessments.length}</strong></div><div><small>Top</small><strong>${assessments.filter(a => a.status === 'TOP CANDIDATE').length}</strong></div><div><small>Risk</small><strong>${assessments.filter(a => a.status === 'HIGH RISK' || a.status === 'DISQUALIFIED').length}</strong></div></div></section><div class="popup-dashboard-link"><button id="open-dashboard" type="button">Open dashboard</button></div><div class="popup-section-head"><div><h2>Visible coins</h2><p class="muted popup-hint">Select a row for full evidence.</p></div></div><details class="popup-filters" ${filtersExpanded ? 'open' : ''}><summary><span>Filters</span><small>Launchpad and quote</small></summary><div class="popup-filters-body">${launchpadFilter}${quoteFilter}</div></details><div class="popup-list">${visible.slice(0, 4).map(a => popupCoinRow(a, { settings, mode })).join('') || '<p class="muted">No coins match these filters.</p>'}</div>`;
  frame(content);
}
restartAutoRefresh();
void loadWalletList().then(wallets => {
  adoptWallets(wallets, walletStatus);
  if (popupTab === 'settings') paint();
});
void loadIntegrationPrefs().then(prefs => {
  integrationPrefs = prefs;
  if (popupTab === 'settings') paint();
});
void render();
