import { scoutMark } from './asset.js';
import type { CoinObservation } from './coinHistory.js';
import { summarizeHistory } from './coinHistory.js';
import { attachOverlayFrame, applyOverlayRect } from './overlayFrame.js';
import { loadOverlayFlags, loadOverlayRects, saveOverlayFlag, saveOverlayRect } from './overlayPrefs.js';
import type { PulseLabels } from './pulseLabels.js';
import { renderPulseTooltip } from './pulseTooltip.js';
import { readRowReadings } from './rowReadings.js';
import type { Assessment, Stage } from './types.js';

/**
 * The hover popup that both list overlays share. Axiom Pulse and GMGN publish
 * different row shapes, so each overlay collects its own rows and answers its own
 * questions; everything else — the black/red panel, the mascot verdict badge, the
 * short mode, drag/resize, dismissal, and the mouse and keyboard plumbing — lives
 * here so the two sites can never drift apart.
 */

export interface TooltipRow {
  element: HTMLElement;
  mint: string | null;
  stage?: Stage;
  labels?: PulseLabels;
}

export interface PulseTooltipHostOptions {
  document?: Document;
  /** Seconds between scans, shown in the tooltip. */
  intervalSeconds: () => number;
  /** Current rows, so a hovered row can be resolved back to its mint. */
  rows: () => TooltipRow[];
  /** The current assessment for a mint, or null when there is none (yet). */
  assessment: (mint: string, now: number) => Assessment | null;
  /** Whether Scout has already asked about this mint: drives "scanning" vs "unknown". */
  attempted: (mint: string) => boolean;
  /** Coin observations behind the history / copycat line. */
  history: () => CoinObservation[];
}

const colouredClasses = ['scout-pulse-green', 'scout-pulse-amber', 'scout-pulse-red', 'scout-pulse-gray', 'scout-pulse-neutral'];
/** Grace period so the pointer can travel from the row into the popup. */
const hideDelayMs = 220;

export function createPulseTooltipHost(options: PulseTooltipHostOptions) {
  const doc = options.document ?? document;
  let element: HTMLElement | null = null;
  let body: HTMLElement | null = null;
  let detachFrame: (() => void) | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let activeRow: HTMLElement | null = null;
  let dismissedRow: HTMLElement | null = null;
  let short = false;
  let shortButton: HTMLElement | null = null;
  let attached = false;

  /** Keep the short-mode button label in step with its state. */
  function syncShortButton(): void {
    if (!shortButton) return;
    shortButton.textContent = short ? '+' : '\u2212';
    shortButton.setAttribute('aria-label', short ? 'Show all details' : 'Hide details and keep it short');
    shortButton.setAttribute('title', short ? 'Show all details' : 'Show only the verdict (short)');
  }

  function cancelHide(): void {
    if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null; }
  }

  function hide(): void {
    cancelHide();
    element?.classList.remove('is-visible');
    activeRow = null;
  }

  function scheduleHide(): void {
    cancelHide();
    hideTimer = setTimeout(() => { hideTimer = null; hide(); }, hideDelayMs);
  }

  /** Repaint the popup for the row under the pointer, if any. */
  function update(): void {
    if (!element || !body || !activeRow) return;
    const row = options.rows().find(item => item.element === activeRow);
    if (!row) { hide(); return; }
    const now = Date.now();
    const assessment = row.mint ? options.assessment(row.mint, now) : null;
    const state = assessment ? 'assessed' : row.mint && !options.attempted(row.mint) ? 'scanning' : 'unknown';
    const history = assessment ? summarizeHistory(options.history(), assessment.token) : null;
    renderPulseTooltip(body, assessment, row.mint, state, now, {
      stage: row.stage,
      labels: row.labels,
      similar: history?.similar.length ?? 0,
      observedHigh: history?.observedHigh ?? null,
      // Re-read the card so the numbers shown are the ones on screen right now.
      readings: readRowReadings(row.element),
      attempted: row.mint ? options.attempted(row.mint) : false,
      intervalSeconds: options.intervalSeconds(),
      compact: short
    });
    element.dataset.scoutTone = toneOf(row.element);
    // While Scout is still gathering evidence the badge is amber, whatever the row
    // colour happens to be, so "still scanning" is never mistaken for a verdict.
    element.dataset.scoutState = state;
    element.classList.add('is-visible');
  }

  function toneOf(element: HTMLElement): string {
    return colouredClasses.find(name => element.classList.contains(name))?.replace('scout-pulse-', '') ?? 'gray';
  }

  function onRowEnter(event: Event): void {
    const target = event.target as Element | null;
    const row = target?.closest?.('.scout-pulse-row');
    if (!row || !(row instanceof (doc.defaultView?.HTMLElement ?? HTMLElement))) return;
    cancelHide();
    const candidate = row as HTMLElement;
    if (candidate === dismissedRow) return;
    dismissedRow = null;
    activeRow = candidate;
    update();
  }

  function onRowLeave(event: MouseEvent | FocusEvent): void {
    if (!activeRow) return;
    const related = event.relatedTarget as Node | null;
    if (related && (activeRow.contains(related) || element?.contains(related))) return;
    scheduleHide();
  }

  /** Build the panel and start listening for hover and focus. */
  function attach(): void {
    if (attached || !doc.body) return;
    attached = true;
    element = doc.createElement('aside');
    element.className = 'scout-pulse-tooltip';
    element.setAttribute('role', 'tooltip');
    const bar = doc.createElement('div');
    bar.className = 'scout-pulse-tooltip-bar';
    const brand = doc.createElement('div');
    brand.className = 'scout-pulse-tooltip-brand';
    const badge = scoutMark(doc, 'scout-pulse-tooltip-mark');
    badge.setAttribute('title', 'Scout verdict');
    const grip = doc.createElement('span');
    grip.className = 'scout-pulse-tooltip-grip';
    grip.textContent = '\u2807\u2807';
    grip.setAttribute('title', 'Drag to move');
    brand.append(badge, grip);
    const actions = doc.createElement('div');
    actions.className = 'scout-pulse-tooltip-actions';
    const shorten = doc.createElement('button');
    shorten.type = 'button';
    shorten.className = 'scout-pulse-tooltip-btn';
    shorten.setAttribute('data-scout-action', 'shorten');
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'scout-pulse-tooltip-close';
    close.textContent = '\u00d7';
    close.setAttribute('aria-label', 'Close');
    actions.append(shorten, close);
    bar.append(brand, actions);
    body = doc.createElement('div');
    body.className = 'scout-pulse-tooltip-body';
    const resize = doc.createElement('div');
    resize.className = 'scout-pulse-tooltip-resize';
    resize.setAttribute('title', 'Drag to resize');
    element.append(bar, body, resize);
    doc.body.append(element);
    detachFrame = attachOverlayFrame(element, {
      document: doc,
      handle: bar,
      resize,
      minWidth: 240,
      minHeight: 140,
      maxWidth: 640,
      maxHeight: 680,
      resizeAxis: 'both',
      isBlocked: target => !!target.closest('button'),
      onCommit: rect => { void saveOverlayRect('tooltip', rect); }
    });
    element.addEventListener('mouseenter', cancelHide);
    element.addEventListener('mouseleave', scheduleHide);
    close.addEventListener('click', () => { dismissedRow = activeRow; hide(); });
    shortButton = shorten;
    syncShortButton();
    shorten.addEventListener('click', () => {
      short = !short;
      syncShortButton();
      void saveOverlayFlag('tooltipShort', short);
      update();
    });
    void loadOverlayFlags().then(flags => {
      short = flags.tooltipShort ?? false;
      syncShortButton();
    });
    void loadOverlayRects().then(saved => { if (element && saved.tooltip) applyOverlayRect(element, saved.tooltip); });
    doc.addEventListener('mouseover', onRowEnter);
    doc.addEventListener('mouseout', onRowLeave);
    doc.addEventListener('focusin', onRowEnter);
    doc.addEventListener('focusout', onRowLeave);
  }

  function detach(): void {
    if (!attached) return;
    attached = false;
    cancelHide();
    doc.removeEventListener('mouseover', onRowEnter);
    doc.removeEventListener('mouseout', onRowLeave);
    doc.removeEventListener('focusin', onRowEnter);
    doc.removeEventListener('focusout', onRowLeave);
    detachFrame?.();
    detachFrame = null;
    element?.remove();
    element = null;
    body = null;
    shortButton = null;
    activeRow = null;
    dismissedRow = null;
  }

  return { attach, detach, update, hide, element: () => element };
}
