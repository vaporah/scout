import { fetchTokens, resetProviderCache } from './provider.js';
import { addTrackedMint, fetchTrackedTokens, loadTrackedMints, removeTrackedMint, resetMintCache } from './dex.js';
import { assessTokens } from './analysis.js';
import { defaults, validSettings } from './settings.js';
import { loadSignalHistory, saveSignals } from './signalStore.js';
import { enrichTokensWithGoPlus } from './goplus.js';
import type { Assessment, Settings, Stage, Status } from './types.js';
import { escapeHtml as e, bindCoinImages, bindCopyButtons, loadProviderMode, loadSettings, saveSettings, statusShort } from './ui.js';
import { filterByPlatform, loadPlatformFilter, platformCatalogue, savePlatformFilter, togglePlatform } from './platformFilter.js';
import { filterByQuote, loadQuoteFilter, quoteOptions, saveQuoteFilter, toggleQuote } from './quoteFilter.js';
import { bindProtocolPicker, platformPickerIds, protocolPicker, quotePickerIds } from './protocolPicker.js';
import { stageLabel, tokenCard } from './tokenCard.js';
import { coinDetail } from './coinDetail.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Dashboard root missing');
const app = root;
let settings = loadSettings();
const mode = loadProviderMode();
let assessments: Assessment[] = [];
let selectedMint: string | null = null;
let stage: Stage | 'all' = 'all';
let status: Status | 'all' = 'all';
let search = '';
let platforms = loadPlatformFilter();
let platformsExpanded = false;
let quotes = loadQuoteFilter();
let lastScan = 0;
let error = '';
let timer: number | undefined;
let scanId = 0;
let trackedMints = loadTrackedMints();
let mintError = '';

function render(): void {
  const byFilters = assessments.filter(a =>
    (stage === 'all' || a.token.stage === stage) &&
    (status === 'all' || a.status === status) &&
    (!search || `${a.token.name} ${a.token.symbol} ${a.token.mint}`.toLowerCase().includes(search))
  );
  const filtered = filterByQuote(filterByPlatform(byFilters, platforms), quotes);
  const selected = filtered.find(a => a.token.mint === selectedMint) ?? filtered[0];
  const count = (s: Status) => assessments.filter(a => a.status === s).length;
  const stageOptions = (['new', 'bonding', 'migrated', 'unknown'] as Stage[])
    .map(s => `<option value="${s}" ${stage === s ? 'selected' : ''}>${stageLabel(s)}</option>`).join('');
  const statusOptions = (['TOP CANDIDATE', 'WATCH', 'WAIT FOR CONFIRMATION', 'HIGH RISK', 'DISQUALIFIED', 'UNKNOWN / INCOMPLETE'] as Status[])
    .map(s => `<option value="${s}" ${status === s ? 'selected' : ''}>${e(statusShort(s))}</option>`).join('');
  const launchpads = platformCatalogue(assessments);
  const launchpadFilter = protocolPicker({ items: launchpads, selected: platforms, expanded: platformsExpanded, heading: 'Launchpads' });
  const quoteFilter = protocolPicker({
    items: quoteOptions(assessments), selected: quotes, expanded: true, dense: true,
    heading: 'Quote tokens', ids: quotePickerIds, expander: false, allLabel: 'quote tokens', dataAttribute: 'data-quote'
  });
  app.innerHTML = `
    <header class="topbar"><span class="mark" aria-label="Scout"><img src="scout-raccoon-logo.png" alt="Scout raccoon logo" width="36" height="36"></span><div class="header-copy"><span class="header-kicker">SCOUT / SOLANA</span><strong>Research dashboard</strong></div><div class="top-actions"><span class="scan-time">${lastScan ? `Updated ${new Date(lastScan).toLocaleTimeString()}` : 'Waiting for live data'}</span><button id="refresh" class="primary">Refresh data</button></div></header>
    <main class="page dashboard-page">
      <section class="mint-panel"><div><strong>Track an exact Axiom coin</strong><p>Copy its full Solana mint address from Axiom Pulse. Scout checks independent market data for that mint; it does not read the Axiom page.</p></div><form id="mint-form"><input id="mint-input" type="text" spellcheck="false" autocomplete="off" placeholder="Paste full Solana mint address" aria-label="Solana mint address"><button class="primary" type="submit">Track mint</button></form>${mintError ? `<p class="error" role="alert">${e(mintError)}</p>` : ''}<div class="pinned-mints">${trackedMints.map(mint => `<span><code>${e(mint.slice(0, 6))}…${e(mint.slice(-4))}</code><button type="button" data-remove-mint="${e(mint)}" aria-label="Remove ${e(mint)}">Remove</button></span>`).join('') || '<small>No mints pinned yet.</small>'}</div></section>
      ${error ? `<div class="error" role="alert">${e(error)}</div>` : ''}
      <div class="summary">
        <div><small>Tokens scanned</small><strong>${assessments.length}</strong></div><div><small>Top candidates</small><strong>${count('TOP CANDIDATE')}</strong></div><div><small>Watch</small><strong>${count('WATCH')}</strong></div><div><small>High risk / disqualified</small><strong>${count('HIGH RISK') + count('DISQUALIFIED')}</strong></div>
      </div>
      <div class="workspace"><section class="list-panel"><div class="section-head"><div><h2>Scanner</h2><p>Sorted by score, with risk and missing evidence visible.</p></div></div>
        <div class="filters"><label class="field search-field" for="search"><span>Search</span><input id="search" type="search" placeholder="Name, symbol or mint" value="${e(search)}" aria-label="Search tokens"></label><label class="field" for="stage"><span>Stage</span><select id="stage" class="select" aria-label="Filter by stage"><option value="all">All stages</option>${stageOptions}</select></label><label class="field" for="status"><span>Status</span><select id="status" class="select" aria-label="Filter by status"><option value="all">All statuses</option>${statusOptions}</select></label></div>
        <details class="dashboard-filter-panel"><summary><span>Pool filters</span><small>Launchpads and quote assets</small></summary><div class="dashboard-filter-body">${launchpadFilter}${quoteFilter}</div></details>
        <div class="token-list">${filtered.length ? filtered.map(a => card(a, a.token.mint === selected?.token.mint)).join('') : '<div class="empty">No tokens match these filters.</div>'}</div>
      </section><aside class="detail-panel">${selected ? detail(selected) : '<div class="empty">Select a token to inspect its evidence.</div>'}</aside></div>
      <details class="settings-panel"><summary><span>Scanner settings</span><small>Thresholds and refresh interval</small></summary><div class="settings-panel-body"><div class="section-head"><p>These thresholds affect current assessments.</p><button id="reset" class="subtle">Reset defaults</button></div><div class="setting-grid">${settingInput('minLiquidityUsd', 'Minimum liquidity ($)', settings.minLiquidityUsd, 0, 1000000, 1000)}${settingInput('maxSlippagePct', 'Max estimated impact (%)', settings.maxSlippagePct, 0.1, 20, 0.1)}${settingInput('tradeSizeUsd', 'Sample trade ($)', settings.tradeSizeUsd, 1, 100000, 1)}${settingInput('minScore', 'Candidate score', settings.minScore, 0, 100, 1)}${settingInput('maxAgeHours', 'Maximum age (hours)', settings.maxAgeHours, 1, 720, 1)}${settingInput('refreshSeconds', 'Refresh interval (seconds)', settings.refreshSeconds, 10, 300, 1)}</div></div></details>
      <footer>Market data: GeckoTerminal and DEX Screener · Security: GoPlus when available · Unknown checks stay unknown. Scores are research aids, not trade instructions.</footer>
    </main>`;
  bind();
}

function card(a: Assessment, active: boolean): string {
  return tokenCard(a, { settings, mode, active, pinned: trackedMints.includes(a.token.mint) });
}

function detail(a: Assessment): string {
  return coinDetail(a, { mode, settings, history: loadSignalHistory(mode, a.token.mint) });
}

function settingInput(name: keyof Settings, label: string, value: number, min: number, max: number, step: number): string {
  return `<label>${e(label)}<input data-setting="${name}" type="number" value="${value}" min="${min}" max="${max}" step="${step}"></label>`;
}

function bind(): void {
  bindCoinImages(app);
  bindCopyButtons(app);
  app.querySelector<HTMLFormElement>('#mint-form')?.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const mint = app.querySelector<HTMLInputElement>('#mint-input')?.value.trim() ?? '';
      addTrackedMint(mint);
      trackedMints = loadTrackedMints();
      selectedMint = mint;
      mintError = '';
      void scan();
    } catch (cause) {
      mintError = cause instanceof Error ? cause.message : 'Could not track mint.';
      render();
    }
  });
  app.querySelectorAll<HTMLButtonElement>('[data-remove-mint]').forEach(button => button.addEventListener('click', () => {
    const mint = button.dataset.removeMint;
    if (!mint) return;
    removeTrackedMint(mint);
    trackedMints = loadTrackedMints();
    if (selectedMint === mint) selectedMint = null;
    void scan();
  }));
  app.querySelector<HTMLButtonElement>('#refresh')?.addEventListener('click', () => {
    resetProviderCache();
    resetMintCache();
    void scan();
  });
  app.querySelector<HTMLButtonElement>('#reset')?.addEventListener('click', () => { settings = defaults; saveSettings(settings); restartTimer(); void scan(); });
  app.querySelector<HTMLInputElement>('#search')?.addEventListener('input', event => { search = (event.target as HTMLInputElement).value.trim().toLowerCase(); render(); app.querySelector<HTMLInputElement>('#search')?.focus(); });
  app.querySelector<HTMLSelectElement>('#stage')?.addEventListener('change', event => { stage = (event.target as HTMLSelectElement).value as typeof stage; render(); });
  app.querySelector<HTMLSelectElement>('#status')?.addEventListener('change', event => { status = (event.target as HTMLSelectElement).value as typeof status; render(); });
  bindProtocolPicker(app, {
    onToggle: id => {
      platforms = id ? togglePlatform(platforms, id) : [];
      savePlatformFilter(platforms);
      render();
    },
    onToggleMore: () => { platformsExpanded = !platformsExpanded; render(); }
  }, { ids: platformPickerIds });
  bindProtocolPicker(app, {
    onToggle: id => {
      quotes = id ? toggleQuote(quotes, id) : [];
      saveQuoteFilter(quotes);
      render();
    },
    onToggleMore: () => { /* the quote list is fixed and short, so it never expands */ }
  }, { ids: quotePickerIds, dataAttribute: 'data-quote' });
  app.querySelectorAll<HTMLElement>('[data-mint]').forEach(element => {
    const open = (): void => { selectedMint = element.dataset.mint ?? null; render(); };
    element.addEventListener('click', open);
    element.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    });
  });
  app.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(input => input.addEventListener('change', () => {
    const n = Number(input.value);
    if (!Number.isFinite(n)) { render(); return; }
    settings = validSettings({ ...settings, [input.dataset.setting ?? '']: n });
    saveSettings(settings);
    restartTimer();
    void scan();
  }));
}

async function scan(): Promise<void> {
  const currentScan = ++scanId;
  const currentMode = mode;
  const currentSettings = settings;
  try {
    const now = Date.now();
    const [feed, pinned] = await Promise.allSettled([
      fetchTokens(currentMode, now),
      fetchTrackedTokens(trackedMints, now)
    ]);
    if (currentScan !== scanId) return;
    const feedTokens = feed.status === 'fulfilled' ? feed.value : assessments.filter(a => !trackedMints.includes(a.token.mint)).map(a => a.token);
    const pinnedTokens = pinned.status === 'fulfilled' ? pinned.value.tokens : [];
    const tokens = await enrichTokensWithGoPlus([...feedTokens, ...pinnedTokens], now, trackedMints);
    if (currentScan !== scanId) return;
    assessments = assessTokens(tokens, currentSettings, now, new Set(trackedMints));
    saveSignals(currentMode, assessments, now);
    lastScan = now;
    error = [feed.status === 'rejected' ? String(feed.reason instanceof Error ? feed.reason.message : 'Feed unavailable.') : '', pinned.status === 'fulfilled' ? pinned.value.errors.join('; ') : 'Tracked mint lookup unavailable.'].filter(Boolean).join(' ');
  } catch (cause) {
    if (currentScan !== scanId) return;
    error = cause instanceof Error ? cause.message : 'Scan failed';
    assessments = assessments.map(a => assessTokens([a.token], currentSettings, Date.now(), new Set(trackedMints))[0]).filter((a): a is Assessment => Boolean(a));
    saveSignals(currentMode, assessments);
  }
  render();
}

function restartTimer(): void {
  if (timer !== undefined) window.clearInterval(timer);
  timer = window.setInterval(() => { void scan(); }, settings.refreshSeconds * 1000);
}
restartTimer();
void scan();
