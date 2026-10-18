import { mintPattern } from './dex.js';

const padreHost = 'trade.padre.gg';
const tokenSegments = new Set(['token', 'tokens', 'trade', 'chart', 'terminal', 'meme']);

function padreUrl(href: string, base = 'https://trade.padre.gg/'): URL | null {
  try {
    const url = new URL(href, base);
    return url.protocol === 'https:' && url.hostname === padreHost ? url : null;
  } catch { return null; }
}

/** Resolve one exact Solana mint from a Padre link without trusting tickers or short addresses. */
export function mintFromPadreUrl(href: string, base = 'https://trade.padre.gg/'): string | null {
  const url = padreUrl(href, base);
  if (!url) return null;
  const candidates = new Set((`${url.pathname}${url.search}${url.hash}`).match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g) ?? []);
  if (candidates.size !== 1) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (tokenSegments.has(parts[index]?.toLowerCase() ?? '') && mintPattern.test(parts[index + 1] ?? ''))
      return parts[index + 1] ?? null;
  }
  return [...candidates][0] ?? null;
}

export function isPadreTokenPage(href: string): boolean { return mintFromPadreUrl(href) !== null; }

export function isPadreTrenchesPage(href: string): boolean {
  const url = padreUrl(href);
  return !!url && /^\/trenches(?:\/|$)/i.test(url.pathname);
}

/** Resolve a Padre SPA token page while keeping multi-token Trenches pages unambiguous. */
export function padreDocumentMint(doc: Document, href: string): string | null {
  const routed = mintFromPadreUrl(href);
  if (routed) return routed;
  const page = padreUrl(href);
  if (!page || /^\/(?:trenches|sign-in)(?:\/|$)/i.test(page.pathname)) return null;
  const found = new Set<string>();
  for (const name of ['data-mint', 'data-token-mint', 'data-token-address', 'data-contract-address', 'data-ca', 'data-copy-value', 'data-clipboard-text']) {
    for (const element of Array.from(doc.querySelectorAll(`[${name}]`))) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && (rect.bottom < 0 || rect.top > 420)) continue;
      const value = element.getAttribute(name)?.trim() ?? '';
      if (mintPattern.test(value)) found.add(value);
    }
  }
  return found.size === 1 ? [...found][0] ?? null : null;
}
