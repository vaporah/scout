import { mintPattern } from './dex.js';

/**
 * Per-token detail from GeckoTerminal's token info endpoint.
 *
 * This is the source that answers "what does the dev still hold?" for tokens the
 * security provider has no holder list for: it publishes the developer's address,
 * the developer's share of supply, and the holder distribution by band. Both fields
 * are absent on plenty of tokens, so every value here is nullable and absent genuinely
 * means unknown rather than zero.
 */

export interface HolderBands {
  top10: number | null;
  next10: number | null;
  mid: number | null;
  rest: number | null;
}

export interface TokenInfo {
  holderCount: number | null;
  bands: HolderBands | null;
  /** Address the feed attributes the token to, when it publishes one. */
  developerAddress: string | null;
  /** The developer's share of total supply, in percent. Zero is a real answer. */
  developerHoldingPct: number | null;
}

type ObjectValue = Record<string, unknown>;

const endpoint = 'https://api.geckoterminal.com/api/v2/networks/solana/tokens';
const headers = { Accept: 'application/json;version=20230203' };
const cacheMs = 120_000;
const cache = new Map<string, { at: number; info: TokenInfo | null }>();
let retryAfter = 0;
let requestTimes: number[] = [];
/** The shared public API allows roughly 30 calls a minute; stay well under it. */
const maxRequestsPerMinute = 20;

const object = (value: unknown): ObjectValue | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : null;

/**
 * A percentage that could plausibly be a share of supply. Note the empty-string
 * guard: `Number('')` is 0, and a blank field must read as missing, not as a real
 * zero — "the dev holds 0%" is a meaningful claim and must not be invented.
 */
function percent(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() ? Number(value)
    : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function count(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() ? Number(value)
    : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** Read one token's info payload. Returns null when the feed published nothing usable. */
export function parseGeckoTokenInfo(payload: unknown, mint: string): TokenInfo | null {
  if (!mintPattern.test(mint)) return null;
  const attributes = object(object(object(payload)?.data)?.attributes);
  if (!attributes) return null;
  // Never attribute one token's holders or developer to another: if the payload names
  // a different address, it is not this token's info.
  const address = attributes.address;
  if (typeof address === 'string' && mintPattern.test(address) && address !== mint) return null;
  const holders = object(attributes.holders);
  const distribution = object(holders?.distribution_percentage);
  const bands: HolderBands | null = distribution ? {
    top10: percent(distribution.top_10),
    next10: percent(distribution['11_20']),
    mid: percent(distribution['21_40']),
    rest: percent(distribution.rest)
  } : null;
  const hasBands = bands !== null && Object.values(bands).some(value => value !== null);
  const developerAddress = attributes.developer_address;
  const info: TokenInfo = {
    holderCount: count(holders?.count),
    bands: hasBands ? bands : null,
    developerAddress: typeof developerAddress === 'string' && mintPattern.test(developerAddress) ? developerAddress : null,
    developerHoldingPct: percent(attributes.developer_holding_percentage)
  };
  return info.holderCount !== null || info.bands !== null || info.developerAddress !== null || info.developerHoldingPct !== null
    ? info
    : null;
}

/**
 * Fetch one token's info, cached. Never throws: a token page must keep working when
 * the feed is rate limited or the network is down, it just shows less.
 */
export async function fetchTokenInfo(mint: string, now = Date.now()): Promise<TokenInfo | null> {
  if (!mintPattern.test(mint)) return null;
  const previous = cache.get(mint);
  if (previous && now - previous.at < cacheMs) return previous.info;
  requestTimes = requestTimes.filter(at => now - at < 60_000);
  if (now < retryAfter || requestTimes.length >= maxRequestsPerMinute) return null;
  requestTimes.push(now);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${endpoint}/${mint}/info`, { headers, signal: controller.signal });
    if (response.status === 429 || response.status === 503) {
      const seconds = Number(response.headers.get('Retry-After'));
      retryAfter = now + (Number.isFinite(seconds) && seconds > 0 ? Math.min(300, seconds) : 60) * 1000;
      return null;
    }
    if (!response.ok) return null;
    const info = parseGeckoTokenInfo(await response.json(), mint);
    cache.set(mint, { at: now, info });
    return info;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Test hook: drop cached info so a fixture is really fetched. */
export function resetTokenInfoCache(): void {
  cache.clear();
  requestTimes = [];
  retryAfter = 0;
}
