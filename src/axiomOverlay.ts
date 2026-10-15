import { mintCandidates, mintFromAxiomUrl } from './axiomMint.js';
import { attentionSignals } from './attention.js';
import { formatTokenTags, tokenTags, type TokenCategory } from './categories.js';
import { loadCoinHistory, type CoinObservation } from './coinHistory.js';
import { mintPattern } from './dex.js';
import { type ScanResponse } from './messages.js';
import { narrativeTags } from './narrative.js';
import { requestAssessments } from './scanClient.js';
import { applyPulseSignals, type PulseRow } from './pulseRows.js';
import { defaults, validSettings } from './settings.js';
import type { Assessment, Settings, Status, Stage } from './types.js';
import { movementVerdict, runningWithoutVerdict } from './attention.js';
import { signalClass } from './ui.js';
import { savePulseStatus } from './pulseStatus.js';
import { extractRowLabels, formatPulseLabels, stageFromHeading, stageLabel, type PulseLabels } from './pulseLabels.js';
import { createPulseTooltipHost } from './pulseTooltipHost.js';
import { readRowReadings, type RowReadings } from './rowReadings.js';

const headings = ['New Pairs', 'Final Stretch', 'Migrated'] as const;
const mintAttributes = ['data-mint', 'data-token-mint', 'data-token-address', 'data-contract-address', 'data-ca'] as const;
const identitySelector = `a[href], [title], [aria-label], ${mintAttributes.map(name => `[${name}]`).join(', ')}`;
const labelledMint = /^(?:copy\s+(?:token|contract|coin|mint)\s+address|(?:token|contract|mint)\s+address|copy\s+ca)\s*:?\s*([1-9A-HJ-NP-Za-km-z]{32,44})$/i;
const semanticCardSelector = '[data-scout-pulse-row], [data-testid*="token-card"], [data-testid*="pulse-row"], [role="row"], article';
const rowSelector = `${semanticCardSelector}, li`;
const colouredClasses = ['scout-pulse-green', 'scout-pulse-amber', 'scout-pulse-red', 'scout-pulse-gray', 'scout-pulse-neutral'];
const statuses: Status[] = ['TOP CANDIDATE', 'WATCH', 'WAIT FOR CONFIRMATION', 'HIGH RISK', 'DISQUALIFIED', 'UNKNOWN / INCOMPLETE'];

declare const chrome: unknown;

export type ScanRequest = (mints: string[]) => Promise<ScanResponse>;
export interface VisiblePulseRow { element: HTMLElement; mint: string | null; stage?: Stage; labels?: PulseLabels; readings?: RowReadings }
export interface OverlayOptions {
  document?: Document;
  request?: ScanRequest;
  debounceMs?: number;
  intervalMs?: number;
  batchSize?: number;
  requestTimeoutMs?: number;
}

function isPulsePage(doc: Document): boolean {
  const url = doc.defaultView?.location;
  return url?.hostname === 'axiom.trade' && /^\/pulse(?:\/|$)/i.test(url.pathname);
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
  // jsdom has no layout; a zero rectangle is handled by isHidden instead.
  if (rect.width === 0 && rect.height === 0) return true;
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < view.innerHeight;
}

function headingName(element: Element): string | null {
  const text = element.textContent?.replace(/\s+/g, ' ').trim();
  return headings.find(label => text === label) ?? null;
}

function containsHeading(element: Element): boolean {
  return Array.from(element.querySelectorAll('h1, h2, h3, [role="heading"]')).some(heading => headingName(heading) !== null);
}

function quickBuyCount(element: Element): number {
  return Array.from(element.querySelectorAll('button')).filter(button => /\b(?:buy|sol)\b/i.test(button.textContent ?? '')).length;
}

function looksLikeCoinCard(element: Element): boolean {
  return !containsHeading(element) && !!element.querySelector('img') && quickBuyCount(element) > 0;
}

function directMints(candidate: Element, base: string): Set<string> {
  const mints = mintCandidates(candidate, base);
  const labelled = candidate.matches('[title], [aria-label]')
    ? candidate.getAttribute('title')?.trim().match(labelledMint)?.[1] ?? candidate.getAttribute('aria-label')?.trim().match(labelledMint)?.[1]
    : null;
  if (labelled && mintPattern.test(labelled)) mints.add(labelled);
  return mints;
}

function localMints(element: Element, base: string): Set<string> {
  const mints = mintCandidates(element, base);
  for (const candidate of Array.from(element.querySelectorAll(identitySelector))) {
    for (const mint of directMints(candidate, base)) mints.add(mint);
    if (mints.size > 1) break;
  }
  return mints;
}

/** Only visible, complete, row-local mint identifiers can identify a Pulse card. */
export function mintFromVisiblePulseRow(row: Element, base = 'https://axiom.trade/'): string | null {
  if (isHidden(row) || !inViewport(row)) return null;
  const mints = localMints(row, base);
  return mints.size === 1 ? [...mints][0] ?? null : null;
}

function pulseRegions(doc: Document): { element: Element; stage: Stage }[] {
  const root = doc.body;
  if (!root) return [];
  const walker = doc.createTreeWalker(root, 4); // NodeFilter.SHOW_TEXT
  const regions: { element: Element; stage: Stage }[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const label = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (!label || !headings.includes(label as typeof headings[number])) continue;
    const heading = node.parentElement;
    if (!heading || !headingName(heading) || isHidden(heading)) continue;
    const stage = stageFromHeading(label);
    let ancestor = heading.parentElement;
    while (ancestor && ancestor !== root) {
      if (ancestor.querySelector(semanticCardSelector) || ancestor.querySelector('img') && quickBuyCount(ancestor) > 0
        || ancestor.querySelector(identitySelector) && localMints(ancestor, doc.baseURI).size > 0) {
        if (!regions.some(region => region.element === ancestor)) regions.push({ element: ancestor, stage });
        break;
      }
      ancestor = ancestor.parentElement;
    }
  }
  return regions;
}

function rowForIdentity(identity: Element, region: Element, base: string): HTMLElement | null {
  const mintSet = localMints(identity, base);
  if (mintSet.size !== 1) return null;
  const mint = [...mintSet][0];
  if (!mint) return null;
  const marked = identity.closest(rowSelector);
  if (marked && region.contains(marked) && localMints(marked, base).size !== 1) return null;

  // Climb to the LARGEST ancestor that still contains exactly this one mint, so
  // the highlight fills the whole card rather than an inner fragment.
  let current: Element | null = identity;
  let best: Element | null = null;
  let bestArea = -1;
  let depth = 0;
  while (current && current !== region && depth++ < 16) {
    const mints = localMints(current, base);
    if (mints.size !== 1 || !mints.has(mint) || containsHeading(current)) break;
    const rect = current.getBoundingClientRect();
    const layoutUnknown = rect.width === 0 && rect.height === 0;
    const sized = layoutUnknown || rect.height <= 300 && rect.height >= 24 && rect.width >= 120;
    if (sized) {
      const area = layoutUnknown ? 1 : rect.width * rect.height;
      if (area >= bestArea) { bestArea = area; best = current; }
    }
    const parent: Element | null = current.parentElement;
    if (!parent || parent === region || containsHeading(parent)) break;
    if (localMints(parent, base).size > 1) {
      // A wrapper holding several coins is not one row. Only a whole-card
      // identity with real dimensions may be accepted.
      if (best === identity && !marked) {
        const bounds = identity.getBoundingClientRect();
        if (bounds.width < 140 || bounds.height < 28) return null;
      }
      break;
    }
    current = parent;
  }
  if (!best) return null;
  // An explicit row marker wins when it still contains precisely this mint.
  if (marked && region.contains(marked) && localMints(marked, base).size === 1 && !containsHeading(marked)) best = marked;
  return best instanceof (identity.ownerDocument.defaultView?.HTMLElement ?? HTMLElement) ? best as HTMLElement : null;
}

/** Returns cards in column-interleaved order so one capped batch covers all three stages. */
export function collectPulseRows(doc: Document): PulseRow[] {
  if (!isPulsePage(doc)) return [];
  const regions = pulseRegions(doc);
  const columns: PulseRow[][] = [];
  const seen = new Set<HTMLElement>();
  for (const region of regions) {
    const rows: PulseRow[] = [];
    for (const identity of Array.from(region.element.querySelectorAll(identitySelector))) {
      if (directMints(identity, doc.baseURI).size === 0) continue;
      if (isHidden(identity) || !inViewport(identity)) continue;
      const row = rowForIdentity(identity, region.element, doc.baseURI);
      if (!row || seen.has(row)) continue;
      const mint = mintFromVisiblePulseRow(row, doc.baseURI);
      if (!mint) continue;
      seen.add(row);
      rows.push({ element: row, mint, stage: region.stage });
    }
    if (rows.length) columns.push(rows);
  }
  const result: PulseRow[] = [];
  for (let index = 0; columns.some(column => index < column.length); index++) {
    for (const column of columns) {
      const row = column[index];
      if (row) result.push(row);
    }
  }
  return result;
}

function visualRowFromImage(image: Element, region: Element): HTMLElement | null {
  let current = image.parentElement;
  while (current && current !== region) {
    if (containsHeading(current) || quickBuyCount(current) > 1) break;
    const rect = current.getBoundingClientRect();
    const layoutUnknown = rect.width === 0 && rect.height === 0;
    if (looksLikeCoinCard(current) && (layoutUnknown || rect.height >= 28 && rect.height <= 240 && rect.width >= 140))
      return current instanceof (image.ownerDocument.defaultView?.HTMLElement ?? HTMLElement) ? current as HTMLElement : null;
    current = current.parentElement;
  }
  return null;
}

/** Includes unidentifiable coins so they can receive an explicit UNKNOWN colour. */
export function collectAllPulseRows(doc: Document): VisiblePulseRow[] {
  if (!isPulsePage(doc)) return [];
  const rows: VisiblePulseRow[] = collectPulseRows(doc).map(row => ({ ...row, labels: extractRowLabels(row.element), readings: readRowReadings(row.element) }));
  const seen = new Set(rows.map(row => row.element));
  for (const region of pulseRegions(doc)) {
    for (const candidate of Array.from(region.element.querySelectorAll(rowSelector))) {
      if (candidate.querySelector(rowSelector) || containsHeading(candidate) || isHidden(candidate) || !inViewport(candidate)) continue;
      const row = candidate instanceof (doc.defaultView?.HTMLElement ?? HTMLElement) ? candidate as HTMLElement : null;
      if (!row || seen.has(row)) continue;
      const mint = mintFromVisiblePulseRow(row, doc.baseURI);
      const explicitCard = row.matches('article, [data-testid*="token-card"], [data-testid*="pulse-row"], [role="row"]');
      if (!mint && !explicitCard && !looksLikeCoinCard(row)) continue;
      seen.add(row);
      rows.push({ element: row, mint, stage: region.stage, labels: extractRowLabels(row), readings: readRowReadings(row) });
    }
    for (const image of Array.from(region.element.querySelectorAll('img'))) {
      if (isHidden(image) || !inViewport(image)) continue;
      const row = visualRowFromImage(image, region.element);
      if (!row || seen.has(row) || Array.from(seen).some(other => other.contains(row) || row.contains(other))) continue;
      seen.add(row);
      rows.push({ element: row, mint: mintFromVisiblePulseRow(row, doc.baseURI), stage: region.stage, labels: extractRowLabels(row), readings: readRowReadings(row) });
    }
  }
  return rows;
}

function validAssessment(input: unknown, now: number): input is Assessment {
  if (!input || typeof input !== 'object') return false;
  const a = input as Partial<Assessment>;
  const token = a.token;
  return !!token && mintPattern.test(token.mint) && token.provider !== 'SIMULATED DEMO'
    && Number.isFinite(token.observedAt) && token.observedAt <= now + 60_000
    && typeof a.expiresAt === 'number' && Number.isFinite(a.expiresAt) && a.expiresAt >= now
    && typeof a.score === 'number' && Number.isFinite(a.score)
    && statuses.includes(a.status as Status) && Array.isArray(a.critical) && Array.isArray(a.warnings) && Array.isArray(a.missing)
    && (token.liquidityUsd === null || typeof token.liquidityUsd === 'number')
    && (token.priceChange5mPct === null || typeof token.priceChange5mPct === 'number')
    && (a.slippagePct === null || typeof a.slippagePct === 'number');
}

function clearRow(row: HTMLElement): void {
  row.classList.remove(...colouredClasses, 'scout-pulse-row', 'scout-pulse-buzz', 'scout-pulse-hot');
  row.removeAttribute('data-scout-mint');
  row.removeAttribute('data-scout-status');
  row.removeAttribute('data-scout-buzz');
  row.removeAttribute('data-scout-hot');
  row.querySelectorAll(':scope > .scout-pulse-badge').forEach(badge => badge.remove());
  row.querySelectorAll(':scope > .scout-pulse-tags').forEach(tags => tags.remove());
}

function badgeStyle(a: Assessment, settings: Settings): 'green' | 'amber' | 'red' | 'gray' | 'run' {
  const signal = signalClass(a, settings);
  // A coin that is moving right now is never left silent, however little its score can
  // say. For a brand-new pair most of the score is made of fields nobody has published
  // yet, so a low score says "not enough evidence", not "nothing is happening".
  if (runningWithoutVerdict(a, settings)) return 'run';
  return signal === 'signal-green' ? 'green'
    : signal === 'signal-amber' ? 'amber'
    : signal === 'signal-red' ? 'red' : 'gray';
}

function badgeText(a: Assessment, kind: ReturnType<typeof badgeStyle>): string {
  if (kind === 'red') return (a.token.priceChange5mPct ?? 0) <= -25 ? 'SCOUT \u00b7 PRICE DROP' : 'SCOUT \u00b7 RISK';
  if (kind === 'green') return `SCOUT ${Math.round(a.score)} \u00b7 TOP`;
  if (kind === 'amber') return a.status === 'WATCH' ? `SCOUT ${Math.round(a.score)} \u00b7 WATCH` : 'SCOUT \u00b7 CAUTION';
  if (kind === 'run') {
    // Only the movement is claimed, and it says so as a multiple rather than as a score.
    const { turnover } = movementVerdict(a.token, a.analytics);
    return turnover === null ? 'SCOUT \u00b7 RUNNING' : `SCOUT \u00b7 RUNNING ${turnover >= 10 ? Math.round(turnover) : turnover.toFixed(1)}\u00d7`;
  }
  return 'SCOUT \u00b7 UNKNOWN';
}

function setBadge(row: HTMLElement, kind: 'green' | 'amber' | 'red' | 'gray' | 'run' | 'neutral', text: string, explanation: string): void {
  row.classList.add('scout-pulse-row');
  const badge = row.querySelector(':scope > .scout-pulse-badge') ?? row.ownerDocument.createElement('span');
  badge.className = `scout-pulse-badge scout-pulse-badge--${kind}`;
  if (badge.textContent !== text) badge.textContent = text;
  if (badge.getAttribute('title') !== explanation) badge.setAttribute('title', explanation);
  if (!badge.parentElement) row.append(badge);
}

/** Colored platform / category tags (pump.fun, Raydium, Charity, ...). */
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

function pageInfoSuffix(row: Pick<VisiblePulseRow, 'stage' | 'labels'>): string {
  const parts: string[] = [];
  if (row.stage) parts.push(stageLabel(row.stage));
  const labels = row.labels ? formatPulseLabels(row.labels) : null;
  if (labels) parts.push(labels);
  return parts.join(' \u00b7 ');
}

function addBadge(row: HTMLElement, a: Assessment, settings: Settings, info?: Pick<VisiblePulseRow, 'stage' | 'labels'>, buzz: string[] = []): void {
  const kind = badgeStyle(a, settings);
  const pageInfo = info ? pageInfoSuffix(info) : '';
  const explanation = [a.status, `Score ${Math.round(a.score)}/100`, ...a.critical.slice(0, 2), ...a.warnings.slice(0, 2), ...a.missing.slice(0, 2), ...buzz, pageInfo].filter(Boolean).join(' \u00b7 ').slice(0, 420);
  setBadge(row, kind, badgeText(a, kind), explanation);
}

function addFallbackBadge(row: HTMLElement, mint: string | null, attempted: boolean, info?: Pick<VisiblePulseRow, 'stage' | 'labels'>): void {
  const kind = mint && !attempted ? 'neutral' : 'gray';
  row.classList.remove(...colouredClasses, 'scout-pulse-hot');
  row.classList.add(kind === 'neutral' ? 'scout-pulse-neutral' : 'scout-pulse-gray');
  row.removeAttribute('data-scout-mint');
  row.removeAttribute('data-scout-hot');
  row.dataset.scoutStatus = kind === 'neutral' ? 'SCANNING' : 'UNKNOWN';
  const text = !mint ? 'SCOUT \u00b7 MINT UNKNOWN' : kind === 'neutral' ? 'SCOUT \u00b7 SCANNING' : 'SCOUT \u00b7 UNKNOWN';
  const base = !mint ? 'Full Solana mint is not available in this visible row; no score is assigned.'
    : kind === 'neutral' ? 'Waiting for independent market and security data for this exact mint.'
    : 'No current assessment is available for this exact mint.';
  const pageInfo = info ? pageInfoSuffix(info) : '';
  setBadge(row, kind, text, pageInfo ? `${base} ${pageInfo}` : base);
}

export function createAxiomPulseOverlay(options: OverlayOptions = {}) {
  const doc = options.document ?? document;
  const request = options.request ?? requestAssessments;
  const debounceMs = Math.max(0, options.debounceMs ?? 100);
  const intervalMs = Math.max(100, options.intervalMs ?? 15_000);
  const batchSize = Math.max(1, Math.min(12, options.batchSize ?? 8));
  const requestTimeoutMs = Math.max(1_000, options.requestTimeoutMs ?? 35_000);
  let observer: MutationObserver | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let active = false;
  let inFlight = false;
  let lastRequestAt = 0;
  let cursor = 0;
  let rows: VisiblePulseRow[] = [];
  let previousRows = new Set<HTMLElement>();
  let assessments: Assessment[] = [];
  let settings = defaults;
  const attemptedMints = new Set<string>();
  let lastStatusAt = 0;
  let lastStatus = '';
  let historyRecords: CoinObservation[] = [];
  // The hover popup itself is shared with the GMGN overlay; this overlay only
  // supplies the rows, the assessments and the coin history behind it.
  const tooltip = createPulseTooltipHost({
    document: doc,
    intervalSeconds: () => Math.round(intervalMs / 1000),
    rows: () => rows,
    assessment: (mint, now) => assessments.find(item => item.token.mint === mint && validAssessment(item, now)) ?? null,
    attempted: mint => attemptedMints.has(mint),
    history: () => historyRecords
  });

  function publishStatus(): void {
    const now = Date.now();
    const onPulse = isPulsePage(doc);
    if (!onPulse) return;
    const colouredRows = rows.filter(({ element }) => colouredClasses.some(name => element.classList.contains(name))).length;
    const signature = `${onPulse}:${rows.length}:${colouredRows}`;
    if (signature === lastStatus && now - lastStatusAt < 30_000) return;
    lastStatus = signature;
    lastStatusAt = now;
    void savePulseStatus({ onPulse, visibleRows: rows.length, matchedRows: rows.filter(row => row.mint !== null).length, colouredRows, at: now });
  }

  function render(): void {
    const now = Date.now();
    const current = new Set(rows.map(row => row.element));
    for (const row of previousRows) if (!current.has(row)) clearRow(row);
    previousRows = current;
    const fresh = assessments.filter(a => validAssessment(a, now));
    const matched = rows.filter((row): row is PulseRow => row.mint !== null);
    applyPulseSignals(matched, fresh, settings, now);
    const byMint = new Map(fresh.map(a => [a.token.mint, a]));
    for (const row of rows) {
      const assessment = row.mint ? byMint.get(row.mint) : undefined;
      const narratives = assessment ? narrativeTags(assessment.token) : [];
      const attention = assessment ? attentionSignals(assessment.token, assessment.analytics) : [];
      const tags = assessment ? tokenTags(assessment.token) : [];
      // A neutral assessment intentionally leaves the host row alone. Platform/category
      // chips on every unresolved coin recreated the same visual noise as colouring
      // every row, so they are reserved for an actionable Scout signal.
      const actionable = assessment ? badgeStyle(assessment, settings) !== 'gray' : false;
      setTags(row.element, actionable ? tags : []);
      // The violet buzz ring is for narrative/volume; category tags are shown as chips.
      const buzz = [
        ...narratives.map(n => `Narrative ${n.tag}`),
        ...attention.map(s => s.id === 'volume' ? 'High volume' : 'Broad buying')
      ];
      const categoryText = actionable ? formatTokenTags(tags) : '';
      row.element.classList.toggle('scout-pulse-buzz', buzz.length > 0);
      if (buzz.length) row.element.dataset.scoutBuzz = buzz.join(',');
      else delete row.element.dataset.scoutBuzz;
      if (assessment) addBadge(row.element, assessment, settings, row, categoryText ? [...buzz, categoryText] : buzz);
      else addFallbackBadge(row.element, row.mint, row.mint ? attemptedMints.has(row.mint) : true, row);
    }
    tooltip.update();
  }

  function reconcile(): void {
    if (!active) return;
    rows = collectAllPulseRows(doc);
    const visibleMints = new Set(rows.map(row => row.mint).filter((mint): mint is string => mint !== null));
    for (const mint of attemptedMints) if (!visibleMints.has(mint)) attemptedMints.delete(mint);
    assessments = assessments.filter(assessment => visibleMints.has(assessment.token.mint));
    render();
    publishStatus();
    void maybeRequest();
  }

  async function maybeRequest(): Promise<void> {
    if (inFlight || !rows.length) return;
    const mints = [...new Set(rows.map(row => row.mint).filter((mint): mint is string => mint !== null))];
    if (!mints.length) return;
    const unseen = mints.filter(mint => !attemptedMints.has(mint));
    const now = Date.now();
    const waitMs = unseen.length ? Math.min(intervalMs, 3_000) : intervalMs;
    if (lastRequestAt && now - lastRequestAt < waitMs) return;
    const batch = unseen.length ? unseen.slice(0, batchSize)
      : Array.from({ length: Math.min(batchSize, mints.length) }, (_, index) => mints[(cursor + index) % mints.length]).filter((mint): mint is string => !!mint);
    if (!unseen.length) cursor = (cursor + batch.length) % mints.length;
    lastRequestAt = now;
    inFlight = true;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    try {
      const response = await Promise.race([
        request(batch),
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Scout scan timed out')), requestTimeoutMs); })
      ]);
      if (!active || !isPulsePage(doc)) return;
      const now = Date.now();
      const returned = Array.isArray(response?.assessments)
        ? response.assessments.filter(a => validAssessment(a, now) && batch.includes(a.token.mint)) : [];
      // No result from a failed lookup must remove a former highlight for that mint.
      assessments = assessments.filter(a => !batch.includes(a.token.mint)).concat(returned);
      settings = validSettings(response?.settings);
    } catch {
      assessments = assessments.filter(a => !batch.includes(a.token.mint));
    } finally {
      if (timeout !== null) clearTimeout(timeout);
      for (const mint of batch) attemptedMints.add(mint);
      inFlight = false;
      if (active) {
        rows = collectAllPulseRows(doc);
        render();
        publishStatus();
        void loadCoinHistory().then(records => { if (active) historyRecords = records; });
      }
    }
  }

  function schedule(): void {
    if (!active || timer !== null) return;
    timer = setTimeout(() => { timer = null; reconcile(); }, debounceMs);
  }

  function onResume(): void {
    if (doc.visibilityState === 'hidden') return;
    lastRequestAt = 0;
    reconcile();
  }

  function start(): void {
    if (active || !doc.body) return;
    active = true;
    const view = doc.defaultView;
    tooltip.attach();
    void loadCoinHistory().then(records => { if (active) historyRecords = records; });
    observer = new (view?.MutationObserver ?? MutationObserver)(mutations => {
      const host = tooltip.element();
      if (host && mutations.every(mutation => host.contains(mutation.target))) return;
      schedule();
    });
    observer.observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['href', ...mintAttributes, 'hidden', 'aria-hidden'] });
    view?.addEventListener('popstate', schedule);
    view?.addEventListener('hashchange', schedule);
    view?.addEventListener('pageshow', onResume);
    view?.addEventListener('focus', onResume);
    doc.addEventListener('visibilitychange', onResume);
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
    doc.defaultView?.removeEventListener('hashchange', schedule);
    doc.defaultView?.removeEventListener('pageshow', onResume);
    doc.defaultView?.removeEventListener('focus', onResume);
    doc.removeEventListener('visibilitychange', onResume);
    timer = heartbeat = null;
    for (const row of previousRows) clearRow(row);
    previousRows.clear();
    rows = [];
    assessments = [];
    tooltip.detach();
  }

  return { start, stop, reconcile };
}

if (typeof chrome !== 'undefined' && typeof document !== 'undefined') {
  const overlay = createAxiomPulseOverlay();
  if (document.body) overlay.start();
  else document.addEventListener('DOMContentLoaded', () => overlay.start(), { once: true });
}
