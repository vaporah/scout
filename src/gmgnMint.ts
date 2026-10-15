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
  // Ticker-only routes must never be treated as an identity.
  return null;
}

/** Whether a GMGN URL is a token chart page (as opposed to Trenches or home). */
export function isGmgnTokenPage(href: string): boolean {
  return mintFromGmgnUrl(href) !== null;
}

/** Whether a GMGN URL is the Trenches list. */
export function isGmgnTrenchesPage(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' && hosts.includes(url.hostname) && /\/trenches(?:\/|$)/i.test(url.pathname);
  } catch { return false; }
}
