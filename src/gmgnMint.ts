import { mintPattern } from './dex.js';

const hosts = ['gmgn.ai', 'www.gmgn.ai'];

/**
 * Accept only a full Solana mint embedded in a GMGN URL. GMGN exposes token
 * pages as /{chain}/token/{mint} (for example /sol/token/{mint}); the mint is
 * the path segment immediately after "token" (or "meme").
 */
export function mintFromGmgnUrl(href: string, base = 'https://gmgn.ai/'): string | null {
  let url: URL;
  try { url = new URL(href, base); }
  catch { return null; }
  if (url.protocol !== 'https:' || !hosts.includes(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const index = parts.findIndex(part => part.toLowerCase() === 'token' || part.toLowerCase() === 'meme');
  if (index !== -1) {
    const mint = parts[index + 1] ?? '';
    if (mintPattern.test(mint)) return mint;
  }
  const anywhere = new Set((`${url.pathname}${url.search}${url.hash}`).match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) ?? []);
  if (anywhere.size === 1) return [...anywhere][0] ?? null;
  // Ticker-only routes must never be treated as an identity.
  return null;
}

/** Whether a GMGN URL is a token chart page (as opposed to Trenches or home). */
export function isGmgnTokenPage(href: string): boolean {
  return mintFromGmgnUrl(href) !== null;
}

/** Resolve the active GMGN chart during SPA transitions where the URL may lag. */
export function gmgnDocumentMint(doc: Document, href: string): string | null {
  const routed = mintFromGmgnUrl(href);
  if (routed) return routed;
  // GMGN's Trenches also exposes many full addresses in links and attributes. The
  // root route is its current Trenches URL, while /{chain}/trenches is the older one.
  // DOM fallback is only for a chart-like route whose address is temporarily absent.
  try {
    const page = new URL(href);
    if (hosts.includes(page.hostname) && (page.pathname === '/' || /\/trenches(?:\/|$)/i.test(page.pathname))) return null;
  } catch { return null; }
  const names = ['data-mint', 'data-token-mint', 'data-token-address', 'data-contract-address', 'data-ca', 'data-copy-value', 'data-clipboard-text'];
  const found = new Set<string>();
  for (const name of names) {
    for (const element of Array.from(doc.querySelectorAll(`[${name}]`))) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && (rect.bottom < 0 || rect.top > 360)) continue;
      const value = element.getAttribute(name)?.trim() ?? '';
      if (mintPattern.test(value)) found.add(value);
    }
  }
  if (found.size === 1) return [...found][0] ?? null;
  const counts = new Map<string, number>();
  for (const element of Array.from(doc.querySelectorAll('*'))) {
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

/** Whether a GMGN URL is the Trenches list. */
export function isGmgnTrenchesPage(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' && hosts.includes(url.hostname) && /\/trenches(?:\/|$)/i.test(url.pathname);
  } catch { return false; }
}
