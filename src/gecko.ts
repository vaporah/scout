import type { Token, TokenProvider } from './types.js';

// quote_token has to be in the include list, or the payload only carries the
// quote's id and the quote-token filter has no symbol to bucket on.
const endpoint = 'https://api.geckoterminal.com/api/v2/networks/solana/new_pools?include=base_token,quote_token,dex';
const cacheMs = 60_000;
let cache: { at: number; tokens: Token[] } | null = null;
let retryAfter = 0;

/** Drop the cached live feed (used when a caller must re-validate immediately). */
export function resetGeckoCache(): void {
  if (cache) cache.at = 0;
}

type Obj = Record<string, unknown>;
const object = (value: unknown): Obj => value && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {};
const string = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const number = (value: unknown): number | null => {
  const parsed = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};
const nonnegative = (value: unknown): number => Math.max(0, number(value) ?? 0);
/** Same, but keeps "the feed did not say" distinct from "the answer is zero". */
const optionalNonnegative = (value: unknown): number | null => {
  const parsed = number(value);
  return typeof parsed === 'number' && Number.isFinite(parsed) ? Math.max(0, parsed) : null;
};
const address = (value: unknown): string | null => {
  const text = string(value);
  return text && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(text) ? text : null;
};

export function parseGeckoPools(payload: unknown, now: number): Token[] {
  const response = object(payload);
  if (!Array.isArray(response.data)) throw new Error('Live feed returned an unexpected response');
  const included = new Map<string, Obj>();
  for (const item of Array.isArray(response.included) ? response.included : []) {
    const entry = object(item);
    const id = string(entry.id);
    if (id) included.set(id, object(entry.attributes));
  }
  const byMint = new Map<string, Token>();
  for (const item of response.data) {
    const pool = object(item);
    const attrs = object(pool.attributes);
    const relation = object(object(object(pool.relationships).base_token).data);
    const dexId = string(object(object(object(pool.relationships).dex).data).id);
    const quoteId = string(object(object(object(pool.relationships).quote_token).data).id);
    const token = included.get(string(relation.id) ?? '') ?? {};
    // The quote asset is what the pool is paired against (SOL, USDC, ...), which is
    // what the quote-token filter buckets on. It is null when the feed omits it.
    const quoteSymbol = quoteId ? string(included.get(quoteId)?.symbol) ?? null : null;
    const mint = address(token.address);
    const poolAddress = address(attrs.address);
    const createdAt = Date.parse(string(attrs.pool_created_at) ?? '');
    if (!mint || !poolAddress || !Number.isFinite(createdAt) || createdAt > now + 60_000) continue;
    const transactions = object(object(attrs.transactions).m5);
    const volume = object(attrs.volume_usd);
    const priceChanges = object(attrs.price_change_percentage);
    const liquidityUsd = number(attrs.reserve_in_usd);
    const candidate: Token = {
      mint, chain: 'solana', poolAddresses: [poolAddress], name: string(token.name) ?? mint.slice(0, 6), symbol: string(token.symbol) ?? '?',
      stage: 'new', launchedAt: createdAt, observedAt: now,
      priceUsd: number(attrs.base_token_price_usd), marketCapUsd: number(attrs.market_cap_usd),
      fdvUsd: number(attrs.fdv_usd), liquidityUsd: liquidityUsd !== null && liquidityUsd >= 0 ? liquidityUsd : null,
      liquidityChangePct: null, priceChange5mPct: number(priceChanges.m5), imageUrl: string(token.image_url),
      trades: [], holders: null,
      developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: 'Creator history is not supplied by this feed.' },
      mintAuthority: null, freezeAuthority: null, transferRestriction: null,
      migrationProgressPct: null, provider: 'GeckoTerminal • live pool feed',
      sourceUrl: `https://www.geckoterminal.com/solana/pools/${poolAddress}`,
      // The pool DEX is the key the launchpad filter uses (pumpfun, raydium, meteora, ...).
      dexName: dexId ? dexId.replace(/^solana_/, '') : null,
      quoteSymbol,
      marketSnapshot: {
        volume5m: nonnegative(volume.m5), volume15m: nonnegative(volume.m15),
        buys5m: nonnegative(transactions.buys), sells5m: nonnegative(transactions.sells),
        buyers5m: optionalNonnegative(transactions.buyers), sellers5m: optionalNonnegative(transactions.sellers)
      }
    };
    const current = byMint.get(mint);
    if (!current || (candidate.liquidityUsd ?? 0) > (current.liquidityUsd ?? 0)) byMint.set(mint, candidate);
  }
  return [...byMint.values()];
}

export const geckoProvider: TokenProvider = {
  id: 'live', label: 'Live Solana pools',
  async fetch(now) {
    if (cache && now - cache.at < cacheMs) return cache.tokens;
    if (now < retryAfter) {
      if (cache) return cache.tokens;
      throw new Error('Live feed rate limited; waiting before retry.');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(endpoint, { headers: { Accept: 'application/json;version=20230203' }, signal: controller.signal });
      if (response.status === 429) {
        const seconds = Number(response.headers.get('Retry-After'));
        retryAfter = Date.now() + (Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 300) : 60) * 1000;
        if (cache) return cache.tokens;
        throw new Error('Live feed rate limited; waiting before retry.');
      }
      if (!response.ok) throw new Error(`Live feed HTTP ${response.status}`);
      const tokens = parseGeckoPools(await response.json(), now);
      if (!tokens.length) throw new Error('Live feed returned no usable Solana pools');
      cache = { at: now, tokens };
      return tokens;
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') throw new Error('Live feed timed out');
      throw cause;
    } finally { clearTimeout(timeout); }
  }
};
