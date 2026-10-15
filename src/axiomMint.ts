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
  return candidates.length === 1 ? candidates[0] ?? null : null;
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
