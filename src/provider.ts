import { demoProvider } from './demo.js';
import { geckoProvider, resetGeckoCache } from './gecko.js';
import type { Token, TokenProvider } from './types.js';

export const providers: Record<string, TokenProvider> = { live: geckoProvider, demo: demoProvider };

/**
 * Drop cached provider responses so the next scan re-validates against the feed.
 * Used when a caller needs an immediate refresh instead of waiting out the cache.
 */
export function resetProviderCache(): void {
  resetGeckoCache();
}
export async function fetchTokens(providerId: string, now = Date.now()): Promise<Token[]> {
  const provider = providers[providerId];
  if (!provider) throw new Error('Provider unavailable.');
  const tokens = await provider.fetch(now);
  if (!Array.isArray(tokens)) throw new Error('Provider returned malformed token list');
  return tokens.filter(t => typeof t.mint === 'string' && typeof t.symbol === 'string' && Number.isFinite(t.observedAt));
}
