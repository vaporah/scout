import { mintPattern } from './dex.js';
import { formatTokenTags, tokenTags, type TokenCategory } from './categories.js';
import { loadCoinHistory, type CoinObservation } from './coinHistory.js';
import { mintFromGmgnUrl } from './gmgnMint.js';
import { createPulseTooltipHost } from './pulseTooltipHost.js';
import { requestAssessments } from './scanClient.js';
import { applyPulseSignals, type PulseRow } from './pulseRows.js';
import { defaults, validSettings } from './settings.js';
import { runningWithoutVerdict } from './attention.js';
import { signalClass } from './ui.js';
import type { Assessment, Settings } from './types.js';

const colouredClasses = ['scout-pulse-green', 'scout-pulse-amber', 'scout-pulse-red', 'scout-pulse-gray', 'scout-pulse-neutral'];

export interface GmgnOverlayOptions {
  document?: Document;
  request?: (mints: string[]) => Promise<{ assessments: Assessment[]; settings?: Settings }>;
  debounceMs?: number;
  intervalMs?: number;
  batchSize?: number;
}

function isHidden(element: Element): boolean {
  if (element.closest('[hidden], [aria-hidden="true"]')) return true;
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  for (let current: Element | null = element; current; current = current.parentElement) {
    const style = view.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return true;
  }
  return false;
}

function inViewport(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return true; // jsdom has no layout
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < view.innerHeight;
}

function mintCount(element: Element): number {
  let count = 0;
  for (const anchor of Array.from(element.querySelectorAll('a[href]'))) {
    if (mintFromGmgnUrl(anchor.getAttribute('href') ?? '')) count++;
  }
  return count;
}

function looksLikeRow(element: Element): boolean {
  return !!element.querySelector('img') && Array.from(element.querySelectorAll('button')).some(button => /\b(?:buy|sell|trade)\b/i.test(button.textContent ?? ''));
}

function rowContainer(anchor: Element): HTMLElement | null {
  const view = anchor.ownerDocument.defaultView;
  let current: Element | null = anchor.parentElement;
  let candidate: HTMLElement | null = null;
  while (current && current !== anchor.ownerDocument.body) {
    if (mintCount(current) > 1) break; // a wrapper containing several tokens is not one row
    const rect = current.getBoundingClientRect();
    const sized = rect.width === 0 && rect.height === 0 || rect.height >= 28 && rect.height <= 320 && rect.width >= 140;
    if (sized) candidate = current as HTMLElement;
    if (looksLikeRow(current)) { candidate = current as HTMLElement; break; }
    current = current.parentElement;
  }
  return candidate;
}

/**
 * Best-effort row discovery for GMGN list pages. GMGN publishes no stable DOM
 * contract, so rows are keyed by full mint links and verified before painting.
 */
export function collectGmgnRows(doc: Document): PulseRow[] {
  const base = 'https://gmgn.ai/';
  const rows: PulseRow[] = [];
  const seen = new Set<string>();
  for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
    const mint = mintFromGmgnUrl(anchor.getAttribute('href') ?? '', base);
    if (!mint || seen.has(mint) || isHidden(anchor) || !inViewport(anchor)) continue;
    const row = rowContainer(anchor);
    if (!row) continue;
    seen.add(mint);
    rows.push({ element: row, mint });
  }
  return rows;
}

function setBadge(row: HTMLElement, kind: 'green' | 'amber' | 'red' | 'gray' | 'run' | 'neutral', text: string, title: string): void {
  row.classList.add('scout-pulse-row');
  const badge = row.querySelector(':scope > .scout-pulse-badge') ?? row.ownerDocument.createElement('span');
  badge.className = `scout-pulse-badge scout-pulse-badge--${kind}`;
  if (badge.textContent !== text) badge.textContent = text;
  badge.setAttribute('title', title);
  if (!badge.parentElement) row.append(badge);
}

function badgeFor(a: Assessment, settings: Settings): { kind: 'green' | 'amber' | 'red' | 'gray' | 'run'; text: string; title: string } {
  const signal = signalClass(a, settings);
  const kind: 'green' | 'amber' | 'red' | 'gray' | 'run' = runningWithoutVerdict(a, settings) ? 'run'
    : signal === 'signal-green' ? 'green' : signal === 'signal-amber' ? 'amber' : signal === 'signal-red' ? 'red' : 'gray';
  const text = kind === 'red' ? 'SCOUT \u00b7 RISK'
    : kind === 'green' ? `SCOUT ${Math.round(a.score)} \u00b7 TOP`
    : kind === 'amber' ? a.status === 'WATCH' ? `SCOUT ${Math.round(a.score)} \u00b7 WATCH` : 'SCOUT \u00b7 CAUTION'
    : kind === 'run' ? 'SCOUT \u00b7 RUNNING'
    : 'SCOUT \u00b7 UNKNOWN';
  const title = [a.status, `Score ${Math.round(a.score)}/100`, ...a.critical.slice(0, 2), ...a.warnings.slice(0, 2), ...a.missing.slice(0, 2)].join(' \u00b7 ').slice(0, 420);
  return { kind, text, title };
}

function clearRow(row: HTMLElement): void {
  row.classList.remove(...colouredClasses, 'scout-pulse-row', 'scout-pulse-hot');
  row.removeAttribute('data-scout-mint');
  row.removeAttribute('data-scout-status');
  row.removeAttribute('data-scout-hot');
  row.querySelectorAll(':scope > .scout-pulse-badge').forEach(badge => badge.remove());
  row.querySelectorAll(':scope > .scout-pulse-tags').forEach(tags => tags.remove());
}

function setTags(row: HTMLElement, tags: TokenCategory[]): void {
  const existing = row.querySelector(':scope > .scout-pulse-tags');
  if (!tags.length) { existing?.remove(); return; }
  const container = existing instanceof (row.ownerDocument.defaultView?.HTMLElement ?? HTMLElement)
    ? existing as HTMLElement
    : row.ownerDocument.createElement('div');
  container.className = 'scout-pulse-tags';
  container.replaceChildren(...tags.slice(0, 3).map(tag => {
    const chip = row.ownerDocument.createElement('span');
    chip.className = 'scout-pulse-tag';
    chip.textContent = tag.label;
    chip.style.setProperty('--scout-tag', tag.color);
    return chip;
  }));
  if (!container.parentElement) row.append(container);
}

function validAssessment(input: unknown, now: number): input is Assessment {
  if (!input || typeof input !== 'object') return false;
  const a = input as Partial<Assessment>;
  const token = a.token;
  return !!token && mintPattern.test(token.mint) && token.provider !== 'SIMULATED DEMO'
    && Number.isFinite(token.observedAt) && token.observedAt <= now + 60_000
    && typeof a.expiresAt === 'number' && Number.isFinite(a.expiresAt) && a.expiresAt >= now
    && typeof a.score === 'number' && Number.isFinite(a.score);
}

export function createGmgnOverlay(options: GmgnOverlayOptions = {}) {
  const doc = options.document ?? document;
  const request = options.request ?? requestAssessments;
  const debounceMs = Math.max(0, options.debounceMs ?? 120);
  const intervalMs = Math.max(100, options.intervalMs ?? 15_000);
  const batchSize = Math.max(1, Math.min(12, options.batchSize ?? 8));
  let observer: MutationObserver | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let active = false;
  let inFlight = false;
  let lastRequestAt = 0;
  let cursor = 0;
  let rows: PulseRow[] = [];
  let previousRows = new Set<HTMLElement>();
  let assessments: Assessment[] = [];
  let settings = defaults;
  const attempted = new Set<string>();
  let historyRecords: CoinObservation[] = [];
  // The same hover popup Axiom Pulse uses. GMGN rows carry no stage or page
  // labels, so the popup leans on the scout scan and live card readings here.
  const tooltip = createPulseTooltipHost({
    document: doc,
    intervalSeconds: () => Math.round(intervalMs / 1000),
    rows: () => rows,
    assessment: (mint, now) => assessments.find(item => item.token.mint === mint && validAssessment(item, now)) ?? null,
    attempted: mint => attempted.has(mint),
    history: () => historyRecords
  });

  function render(): void {
    const now = Date.now();
    const current = new Set(rows.map(row => row.element));
    for (const row of previousRows) if (!current.has(row)) clearRow(row);
    previousRows = current;
    const fresh = assessments.filter(a => validAssessment(a, now));
    applyPulseSignals(rows, fresh, settings, now);
    const byMint = new Map(fresh.map(a => [a.token.mint, a]));
    for (const row of rows) {
      const assessment = byMint.get(row.mint);
      const tags = assessment ? tokenTags(assessment.token) : [];
      const actionable = assessment ? badgeFor(assessment, settings).kind !== 'gray' : false;
      setTags(row.element, actionable ? tags : []);
      const categoryText = actionable ? formatTokenTags(tags) : '';
      if (assessment) {
        const badge = badgeFor(assessment, settings);
        setBadge(row.element, badge.kind, badge.text, categoryText ? `${badge.title} · ${categoryText}` : badge.title);
      } else {
        row.element.classList.remove(...colouredClasses, 'scout-pulse-hot');
        row.element.classList.add(attempted.has(row.mint) ? 'scout-pulse-gray' : 'scout-pulse-neutral');
        setBadge(row.element, attempted.has(row.mint) ? 'gray' : 'neutral',
          attempted.has(row.mint) ? 'SCOUT \u00b7 UNKNOWN' : 'SCOUT \u00b7 SCANNING',
          attempted.has(row.mint) ? 'No current assessment for this exact mint.' : 'Waiting for independent market and security data.');
      }
    }
    tooltip.update();
  }

  function reconcile(): void {
    if (!active) return;
    rows = collectGmgnRows(doc);
    const visible = new Set(rows.map(row => row.mint));
    for (const mint of attempted) if (!visible.has(mint)) attempted.delete(mint);
    assessments = assessments.filter(a => visible.has(a.token.mint));
    render();
    void maybeRequest();
  }

  async function maybeRequest(): Promise<void> {
    if (inFlight || !rows.length) return;
    const mints = [...new Set(rows.map(row => row.mint))];
    const unseen = mints.filter(mint => !attempted.has(mint));
    const now = Date.now();
    const waitMs = unseen.length ? Math.min(intervalMs, 3_000) : intervalMs;
    if (lastRequestAt && now - lastRequestAt < waitMs) return;
    const batch = unseen.length ? unseen.slice(0, batchSize)
      : Array.from({ length: Math.min(batchSize, mints.length) }, (_, index) => mints[(cursor + index) % mints.length])
        .filter((mint): mint is string => typeof mint === 'string');
    if (!unseen.length) cursor = (cursor + batch.length) % mints.length;
    lastRequestAt = now;
    inFlight = true;
    try {
      const response = await request(batch);
      if (!active) return;
      const returned = Array.isArray(response?.assessments)
        ? response.assessments.filter(a => validAssessment(a, Date.now()) && batch.includes(a.token.mint)) : [];
      assessments = assessments.filter(a => !batch.includes(a.token.mint)).concat(returned);
      settings = validSettings(response?.settings);
    } catch {
      assessments = assessments.filter(a => !batch.includes(a.token.mint));
    } finally {
      for (const mint of batch) attempted.add(mint);
      inFlight = false;
      if (active) {
        rows = collectGmgnRows(doc);
        render();
        void loadCoinHistory().then(records => { if (active) historyRecords = records; });
      }
    }
  }

  function schedule(): void {
    if (!active || timer !== null) return;
    timer = setTimeout(() => { timer = null; reconcile(); }, debounceMs);
  }

  function start(): void {
    if (active || !doc.body) return;
    active = true;
    const view = doc.defaultView;
    tooltip.attach();
    void loadCoinHistory().then(records => { if (active) historyRecords = records; });
    observer = new (view?.MutationObserver ?? MutationObserver)(() => schedule());
    observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'data-mint', 'data-token-mint', 'data-token-address', 'hidden', 'aria-hidden'] });
    view?.addEventListener('popstate', schedule);
    doc.addEventListener('visibilitychange', () => { if (doc.visibilityState !== 'hidden') { lastRequestAt = 0; reconcile(); } });
    heartbeat = setInterval(reconcile, Math.min(3000, intervalMs));
    reconcile();
  }

  function stop(): void {
    if (!active) return;
    active = false;
    observer?.disconnect();
    observer = null;
    if (timer !== null) clearTimeout(timer);
    if (heartbeat !== null) clearInterval(heartbeat);
    doc.defaultView?.removeEventListener('popstate', schedule);
    timer = heartbeat = null;
    for (const row of previousRows) clearRow(row);
    previousRows.clear();
    rows = [];
    assessments = [];
    tooltip.detach();
  }

  return { start, stop, reconcile };
}
