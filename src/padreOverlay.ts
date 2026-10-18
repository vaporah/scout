import { createGmgnOverlay, type GmgnOverlayOptions } from './gmgnOverlay.js';
import { mintPattern } from './dex.js';
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

function hrefMints(href: string, base: string): string[] {
  let url: URL;
  try { url = new URL(href, base); }
  catch { return []; }
  // Padre cards link to their quote token too. That is context, not the card's
  // identity, and must never paint the row with the quote token's assessment.
  if (url.hostname === 'trade.padre.gg' && /^(?:quotePill|liveTrades)$/i.test(url.searchParams.get('tpo') ?? '')) return [];
  return (`${url.pathname}${url.search}${url.hash}`).match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) ?? [];
}

/** Resolve the primary token from Padre's card-local contract and launchpad links. */
export function mintFromPadreCard(card: Element): string | null {
  const counts = new Map<string, number>();
  const add = (candidate: string): void => {
    if (mintPattern.test(candidate)) counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  };
  for (const link of Array.from(card.querySelectorAll('[href]'))) {
    for (const candidate of hrefMints(link.getAttribute('href') ?? '', card.ownerDocument.baseURI)) add(candidate);
  }
  for (const name of ['data-mint', 'data-token-mint', 'data-token-address', 'data-contract-address', 'data-ca', 'data-copy-value', 'data-clipboard-text']) {
    for (const element of Array.from(card.querySelectorAll(`[${name}]`))) add(element.getAttribute(name)?.trim() ?? '');
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  if (!ranked.length || ranked.length > 1 && (ranked[0]?.[1] ?? 0) === (ranked[1]?.[1] ?? 0)) return null;
  return ranked[0]?.[0] ?? null;
}

function padreCardForCopyButton(button: Element): HTMLElement | null {
  let current = button.parentElement;
  while (current && current !== button.ownerDocument.body) {
    const rect = current.getBoundingClientRect();
    const sized = rect.width === 0 && rect.height === 0 || rect.width >= 250 && rect.width <= 520 && rect.height >= 90 && rect.height <= 240;
    if (sized && current.querySelector('[role="group"][aria-label="Audit"], [role="group"]')) return current as HTMLElement;
    current = current.parentElement;
  }
  return null;
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
  // Current Padre Trenches cards expose one accessible copy-address control and
  // a card-local launchpad/search link containing the full primary mint.
  for (const button of Array.from(doc.querySelectorAll('button[aria-label="Copy address"]'))) {
    if (hidden(button) || !visible(button)) continue;
    const element = padreCardForCopyButton(button);
    if (!element) continue;
    const mint = mintFromPadreCard(element);
    if (!mint || seen.has(mint)) continue;
    element.setAttribute('data-scout-padre-card', '');
    seen.add(mint);
    rows.push({ element, mint });
  }
  // Compatibility fallback for simpler/older layouts where the primary token was
  // itself a Padre link. Never reconsider a quote-pill or live-trades identity.
  for (const identity of Array.from(doc.querySelectorAll('[href]'))) {
    let candidateUrl: URL;
    try { candidateUrl = new URL(identity.getAttribute('href') ?? '', doc.baseURI); }
    catch { continue; }
    if (/^(?:quotePill|liveTrades)$/i.test(candidateUrl.searchParams.get('tpo') ?? '')) continue;
    const mint = mintFromPadreUrl(identity.getAttribute('href') ?? '', doc.baseURI);
    if (!mint || seen.has(mint) || hidden(identity) || !visible(identity)) continue;
    const element = cardFor(identity);
    if (!element) continue;
    seen.add(mint);
    element.setAttribute('data-scout-padre-card', '');
    rows.push({ element, mint });
  }
  return rows;
}

export function createPadreOverlay(options: GmgnOverlayOptions = {}) {
  return createGmgnOverlay({ ...options, collectRows: collectPadreRows, isTokenPage: isPadreTokenPage });
}
