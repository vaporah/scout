import { mintPattern } from './dex.js';

/**
 * Same-ticker copies: other Solana mints trading under the same symbol. This is what
 * a "vampire" looks like from the outside — a different contract riding an existing
 * ticker — so it is reported as a same-symbol pool, never as proof of intent.
 */
export interface VampPool {
  mint: string;
  symbol: string;
  name: string;
  /** Which public feed reported it, so the popup can label the claim. */
  source: string;
}

const endpoint = 'https://api.dexscreener.com/latest/dex/search?q=';
const maxPools = 5;

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

/**
 * Keep only Solana pools whose base token symbol matches the queried ticker exactly and
 * whose mint differs from the coin being viewed. Anything ambiguous is dropped rather
 * than reported, so Scout never claims a copy it cannot point at.
 */
export function parseVampPools(payload: unknown, mint: string, symbol: string): VampPool[] {
  const wanted = text(symbol).toLowerCase();
  if (!wanted) return [];
  const pairs = object(payload).pairs;
  if (!Array.isArray(pairs)) return [];
  const found = new Map<string, VampPool>();
  for (const entry of pairs) {
    const pair = object(entry);
    if (pair.chainId !== 'solana') continue;
    const base = object(pair.baseToken);
    const address = text(base.address);
    if (!mintPattern.test(address) || address === mint) continue;
    const baseSymbol = text(base.symbol);
    if (baseSymbol.toLowerCase() !== wanted) continue;
    if (!found.has(address)) {
      found.set(address, { mint: address, symbol: baseSymbol, name: text(base.name) || `${address.slice(0, 6)}…`, source: 'DEX Screener search' });
    }
    if (found.size >= maxPools) break;
  }
  return [...found.values()];
}

/** Ask the public feed for other Solana pools using this ticker. Never throws. */
export async function fetchVampPools(symbol: string, mint: string, timeoutMs = 8_000): Promise<VampPool[]> {
  const wanted = text(symbol);
  if (!wanted || wanted === '?') return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${endpoint}${encodeURIComponent(wanted)}`, { signal: controller.signal });
    if (!response.ok) return [];
    return parseVampPools(await response.json(), mint, wanted);
  } catch { return []; }
  finally { clearTimeout(timeout); }
}
