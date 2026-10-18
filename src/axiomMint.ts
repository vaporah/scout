import { mintPattern } from './dex.js';

/** Token route segments Axiom and its mirrors have used for a single Solana coin. */
const routeSegments = new Set(['t', 'meme', 'token', 'coin', 'trade', 'pulse', 'sol', 'pair']);
/** Query parameters that can carry a full mint instead of a route segment. */
const mintParams = ['mint', 'address', 'token', 'tokenaddress', 'tokenAddress', 'ca', 'contract', 'base'];

function fromUrl(url: URL): string | null {
  const chain = url.searchParams.get('chain');
  if (chain !== null && chain !== 'sol') return null;
  for (const name of mintParams) {
    const value = url.searchParams.get(name);
    if (value && mintPattern.test(value)) return value;
  }
  const parts = url.pathname.split('/').filter(Boolean);
  // The mint is the first route segment that is a real mint, so /t/<mint>/chart still works.
  if (routeSegments.has(parts[0]?.toLowerCase() ?? '')) {
    for (const part of parts.slice(1)) {
      const candidate = part.split(/[?#]/)[0] ?? '';
      if (mintPattern.test(candidate)) return candidate;
      if (candidate) break;
    }
  }
  // Hash routes such as /#/t/<mint> are still the same token page.
  const hashParts = url.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (routeSegments.has(hashParts[0]?.toLowerCase() ?? '')) {
    const candidate = hashParts[1] ?? '';
    if (mintPattern.test(candidate)) return candidate;
  }
  return null;
}

/**
 * Accept only a Solana token route on Axiom's real host. Tickers, short addresses
 * and lookalike hosts are ignored, and any non-Solana chain is rejected.
 */
export function mintFromAxiomUrl(href: string, base = 'https://axiom.trade/'): string | null {
  let url: URL;
  try { url = new URL(href, base); }
  catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'axiom.trade') return null;
  return fromUrl(url);
}

/**
 * Page-level detection for the token chart, which is allowed to be a little more
 * forgiving than link parsing: Axiom renames its routes between deploys, and a
 * single unrecognised route name used to mean the token page never scanned.
 *
 * The rule is "the path names exactly one mint". Exactly one is what keeps this
 * safe: list pages and the pulse table carry no full mint in their path at all, so
 * they can never match. This is deliberately *not* used for link parsing, where a
 * creator-wallet link would otherwise be read as a second mint.
 */
export function axiomPageMint(href: string, base = 'https://axiom.trade/'): string | null {
  let url: URL;
  try { url = new URL(href, base); }
  catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== 'axiom.trade') return null;
  const known = fromUrl(url);
  if (known) return known;
  const chain = url.searchParams.get('chain');
  if (chain !== null && chain !== 'sol') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const candidates = parts.filter(part => mintPattern.test(part));
  if (candidates.length === 1) return candidates[0] ?? null;
  // Route and query names change often. Accept one unambiguous full address
  // anywhere in the URL, while refusing URLs carrying several wallet/mint ids.
  const anywhere = new Set((`${url.pathname}${url.search}${url.hash}`).match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) ?? []);
  return anywhere.size === 1 ? [...anywhere][0] ?? null : null;
}

function visibleHeaderMint(doc: Document): string | null {
  const counts = new Map<string, number>();
  for (const element of Array.from(doc.querySelectorAll('*'))) {
    if (element.closest(scoutUiSelector)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && (rect.bottom < 0 || rect.top > 420)) continue;
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.name.startsWith('data-scout') || attribute.value.length > 600) continue;
      for (const match of attribute.value.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) ?? []) {
        if (mintPattern.test(match)) counts.set(match, (counts.get(match) ?? 0) + 1);
      }
    }
  }
  const ranked = [...counts].sort((a, b) => b[1] - a[1]);
  return ranked.length && (ranked.length === 1 || (ranked[0]?.[1] ?? 0) > (ranked[1]?.[1] ?? 0)) ? ranked[0]?.[0] ?? null : null;
}

/**
 * Axiom's SPA sometimes keeps the active token address only in the chart header's
 * explicit contract/copy attributes. That is still a safer identity than scanning
 * arbitrary page text: only known token-address fields are considered, and a page
 * with more than one candidate stays unscanned rather than choosing a wallet or a
 * row from a side panel.
 */
export function axiomDocumentMint(doc: Document, href: string, base = 'https://axiom.trade/'): string | null {
  // Pulse contains dozens of perfectly valid coin addresses. None of them is an
  // active chart identity, even when one happens to dominate the visible cards.
  // Reject the list surface before inspecting its DOM.
  try {
    const page = new URL(href, base);
    if (page.hostname === 'axiom.trade' && /^\/pulse(?:\/|$)/i.test(page.pathname)) return null;
  } catch { return null; }
  const fromLocation = axiomPageMint(href, base);
  if (fromLocation) return fromLocation;

  const canonical = doc.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href
    ?? doc.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content
    ?? '';
  const fromCanonical = canonical ? axiomPageMint(canonical, base) : null;
  if (fromCanonical) return fromCanonical;

  const strongAttributes = [
    'data-mint', 'data-token-mint', 'data-token-address', 'data-contract-address', 'data-ca'
  ];
  const copyAttributes = [
    'data-address', 'data-copy-value', 'data-clipboard-text', 'data-clipboard'
  ];
  // The active chart header sits at the top of the page and often carries the full
  // address only on its copy control. Prefer that local identity before considering
  // holder tables and sidebars, which legitimately contain many other wallets.
  const headerMints = new Set<string>();
  const headerSelector = copyAttributes.map(name => `[${name}]`).join(',');
  for (const element of Array.from(doc.querySelectorAll(headerSelector))) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && (rect.bottom < 0 || rect.top > 360)) continue;
    for (const name of copyAttributes) {
      const value = element.getAttribute(name)?.trim() ?? '';
      if (mintPattern.test(value)) headerMints.add(value);
    }
    if (headerMints.size > 1) break;
  }
  if (headerMints.size === 1) return [...headerMints][0] ?? null;

  const rankedHeader = visibleHeaderMint(doc);
  if (rankedHeader) return rankedHeader;

  const candidates = (attributes: string[]): Set<string> => {
    const found = new Set<string>();
    for (const name of attributes) {
      for (const element of Array.from(doc.querySelectorAll(`[${name}]`))) {
        const value = element.getAttribute(name)?.trim() ?? '';
        if (mintPattern.test(value)) found.add(value);
        if (found.size > 1) return found;
      }
    }
    return found;
  };

  const strong = candidates(strongAttributes);
  if (strong.size === 1) return [...strong][0] ?? null;
  if (strong.size > 1) return null;

  const copy = candidates(copyAttributes);
  return copy.size === 1 ? [...copy][0] ?? null : null;
}

/** Scout's own injected UI, which must never be read back as page evidence. */
export const scoutUiSelector = '.scout-pulse-badge, .scout-pulse-tags, .scout-pulse-tooltip';

/**
 * The visible text of a card with Scout's own badges and tags removed, so a row keeps
 * the same identity and readout no matter what Scout has painted onto it.
 */
export function rowText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  for (const node of Array.from(clone.querySelectorAll(scoutUiSelector))) node.remove();
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Every full mint printed in an element's own attributes, its descendants'
 * attributes, or a short text node. Axiom exposes the mint through links,
 * copy-address controls and data attributes that change between deploys, so this
 * scans values instead of a fixed list of attribute names. Only the element's own
 * short text is read, so a table-level container cannot swallow every mint on the
 * page, and a URL is only trusted when it is a real Axiom token link - a lookalike
 * host can never smuggle a mint in. Callers still require exactly one mint.
 */
export function mintCandidates(element: Element, base = 'https://axiom.trade/'): Set<string> {
  const mints = new Set<string>();
  const add = (value: string | null): void => {
    if (!value || value.length > 400 || mints.size > 1) return;
    const trimmed = value.trim();
    const urlLike = /(?:^|\/\/|:)/.test(trimmed) && /[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmed);
    if (urlLike) {
      // A URL identifies a coin only through the validated Axiom route.
      const fromLink = mintFromAxiomUrl(trimmed, base);
      if (fromLink) mints.add(fromLink);
      return;
    }
    if (mintPattern.test(trimmed)) { mints.add(trimmed); return; }
    // Copy-address labels and inline payloads print the mint as its own token.
    for (const match of trimmed.matchAll(/[1-9A-HJ-NP-Za-km-z]{32,44}/g)) {
      if (mintPattern.test(match[0])) mints.add(match[0]);
      if (mints.size > 1) return;
    }
  };
  for (const attribute of Array.from(element.attributes)) {
    if (attribute.name.startsWith('data-scout')) continue;
    add(attribute.value);
  }
  // Only a small node is cleaned and read, so a page-level container is never cloned.
  if ((element.textContent ?? '').length <= 200) {
    const text = rowText(element);
    if (text.length <= 120) add(text);
  }
  for (const node of Array.from(element.querySelectorAll('*'))) {
    if (mints.size > 1) return mints;
    if (node.closest(scoutUiSelector)) continue;
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.name.startsWith('data-scout')) continue;
      add(attribute.value);
    }
  }
  return mints;
}

/** A row is matchable only if its own links agree on one full mint. */
export function mintFromPulseRow(row: Element, base = 'https://axiom.trade/'): string | null {
  const mints = new Set<string>();
  for (const anchor of Array.from(row.querySelectorAll('a[href]'))) {
    const mint = mintFromAxiomUrl(anchor.getAttribute('href') ?? '', base);
    if (mint) mints.add(mint);
    if (mints.size > 1) return null;
  }
  return mints.size === 1 ? [...mints][0] ?? null : null;
}
