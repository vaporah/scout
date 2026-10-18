import { createGmgnOverlay, type GmgnOverlayOptions } from './gmgnOverlay.js';
import { isPadreTokenPage, mintFromPadreUrl } from './padreMint.js';
import type { PulseRow } from './pulseRows.js';

function hidden(element: Element): boolean {
  if (element.closest('[hidden], [aria-hidden="true"]')) return true;
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  const style = view.getComputedStyle(element);
  return style.display === 'none' || style.visibility === 'hidden';
}

function visible(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view) return false;
  const rect = element.getBoundingClientRect();
  return rect.width === 0 && rect.height === 0 || rect.bottom > 0 && rect.top < view.innerHeight;
}

function linkedMints(element: Element): Set<string> {
  const found = new Set<string>();
  const own = mintFromPadreUrl(element.getAttribute('href') ?? '');
  if (own) found.add(own);
  for (const link of Array.from(element.querySelectorAll('[href]'))) {
    const mint = mintFromPadreUrl(link.getAttribute('href') ?? '');
    if (mint) found.add(mint);
  }
  return found;
}

function cardFor(identity: Element): HTMLElement | null {
  let current: Element | null = identity;
  let candidate: HTMLElement | null = null;
  while (current && current !== identity.ownerDocument.body) {
    if (linkedMints(current).size > 1) break;
    const rect = current.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 || rect.height >= 48 && rect.height <= 360) candidate = current as HTMLElement;
    if (current.matches('article, [role="row"], [data-testid*="token"], [data-testid*="card"]')) return current as HTMLElement;
    current = current.parentElement;
  }
  return candidate;
}

/** Padre's Trenches cards are discovered only from full, host-validated mint links. */
export function collectPadreRows(doc: Document): PulseRow[] {
  if (isPadreTokenPage(doc.defaultView?.location.href ?? doc.URL)) return [];
  const rows: PulseRow[] = [];
  const seen = new Set<string>();
  for (const identity of Array.from(doc.querySelectorAll('[href]'))) {
    const mint = mintFromPadreUrl(identity.getAttribute('href') ?? '', doc.baseURI);
    if (!mint || seen.has(mint) || hidden(identity) || !visible(identity)) continue;
    const element = cardFor(identity);
    if (!element) continue;
    seen.add(mint);
    rows.push({ element, mint });
  }
  return rows;
}

export function createPadreOverlay(options: GmgnOverlayOptions = {}) {
  return createGmgnOverlay({ ...options, collectRows: collectPadreRows, isTokenPage: isPadreTokenPage });
}
