import type { Token } from './types.js';
import { fetchSolFlow } from './solFlow.js';

export const mintPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const storageKey = 'scout.trackedMints.v1';
const cache = new Map<string, { at: number; token: Token }>();
let retryAfter = 0;

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {};
const str = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;
const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const nonnegative = (value: unknown): number => Math.max(0, num(value) ?? 0);
const isSolQuote = (symbol: string | null): boolean => symbol?.toUpperCase() === 'SOL' || symbol?.toUpperCase() === 'WSOL';

export function loadTrackedMints(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(value) ? [...new Set(value.filter((mint): mint is string => typeof mint === 'string' && mintPattern.test(mint)))].slice(0, 5) : [];
  } catch { return []; }
}

export function addTrackedMint(mint: string): void {
  if (!mintPattern.test(mint)) throw new Error('Enter a full Solana mint address, not a name or ticker.');
  const current = loadTrackedMints();
  if (current.includes(mint)) return;
  if (current.length >= 5) throw new Error('Scout can track up to five pinned mints. Remove one first.');
  localStorage.setItem(storageKey, JSON.stringify([...current, mint]));
}

export function removeTrackedMint(mint: string): void {
  localStorage.setItem(storageKey, JSON.stringify(loadTrackedMints().filter(item => item !== mint)));
  cache.delete(mint);
}

function unknownToken(mint: string, now: number, note: string): Token {
  return {
    mint, chain: 'solana', name: mint.slice(0, 6) + '…' + mint.slice(-4), symbol: '?', stage: 'unknown', launchedAt: null, observedAt: now,
    priceUsd: null, marketCapUsd: null, fdvUsd: null, liquidityUsd: null, liquidityChangePct: null, priceChange5mPct: null, imageUrl: null,
    trades: [], holders: null, developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note },
    mintAuthority: null, freezeAuthority: null, transferRestriction: null, migrationProgressPct: null, provider: 'DEX Screener lookup',
    dexName: null, quoteSymbol: null
  };
}

/**
 * Whether a token is only a mint with nothing behind it.
 *
 * Every market source answers "no pool here" with this stand-in rather than by failing,
 * and it is not evidence about a coin: no ticker, no price, no pool, no holders. Feeding
 * it to the scorer produced a real-looking "0/100 · UNKNOWN / INCOMPLETE" card for coins
 * that were merely not indexed yet, which reads as a verdict when it is only an absence,
 * and a genuine 0 is indistinguishable from it. A miss is reported as a miss instead.
 *
 * The test is deliberately strict, so a thinly-covered coin that has any one real figure
 * is still scored normally.
 */
export function isUnidentifiedToken(token: Token): boolean {
  return (token.symbol === '' || token.symbol === '?')
    && (token.poolAddresses?.length ?? 0) === 0
    && token.priceUsd === null
    && token.liquidityUsd === null
    && token.marketCapUsd === null
    && token.holders === null
    && token.holderCount == null
    && token.holderBands == null
    && token.top10HoldPct == null
    && token.holderQuality == null
    && token.developerHoldingPct == null
    && token.marketSnapshot === undefined;
}

export function parseDexPairs(payload: unknown, mint: string, now: number): Token {  if (!mintPattern.test(mint)) throw new Error('Invalid mint address.');
  if (!Array.isArray(payload)) throw new Error('DEX Screener returned an unexpected response.');
  const pair = payload.map(obj).filter(item => item.chainId === 'solana' && obj(item.baseToken).address === mint)
    .sort((a, b) => (num(obj(b.liquidity).usd) ?? 0) - (num(obj(a.liquidity).usd) ?? 0))[0];
  if (!pair) return unknownToken(mint, now, 'No matching Solana pool in the public feed; creator and token controls remain unknown.');
  const base = obj(pair.baseToken);
  const pairAddress = str(pair.pairAddress);
  const createdAt = num(pair.pairCreatedAt);
  const txns = obj(obj(pair.txns).m5);
  const volume = obj(pair.volume);
  const sourceUrl = pairAddress && mintPattern.test(pairAddress) ? `https://dexscreener.com/solana/${pairAddress}` : undefined;
  return {
    mint, chain: 'solana', name: str(base.name) ?? mint.slice(0, 6), symbol: str(base.symbol) ?? '?', stage: 'unknown',
    launchedAt: createdAt !== null && createdAt > 0 && createdAt <= now + 60_000 ? createdAt : null,
    observedAt: now, poolAddresses: pairAddress && mintPattern.test(pairAddress) ? [pairAddress] : [],
    priceUsd: num(pair.priceUsd), marketCapUsd: num(pair.marketCap), fdvUsd: num(pair.fdv),
    liquidityUsd: num(obj(pair.liquidity).usd), liquidityChangePct: null, priceChange5mPct: num(obj(pair.priceChange).m5),
    imageUrl: str(obj(pair.info).imageUrl),
    trades: [], holders: null,
    developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: 'DEX Screener market pairs do not verify creator wallets or token controls.' },
    mintAuthority: null, freezeAuthority: null, transferRestriction: null, migrationProgressPct: null, provider: 'DEX Screener public market pairs', sourceUrl,
    dexName: str(pair.dexId) ?? null,
    quoteSymbol: str(obj(pair.quoteToken).symbol) ?? null,
    liquiditySol: isSolQuote(str(obj(pair.quoteToken).symbol)) ? num(obj(pair.liquidity).quote) : null,
    // DEX Screener publishes buy and sell *counts* but not unique buyers, and a zero
    // here would claim nobody bought. The pool feed path carries the counts only.
    marketSnapshot: { volume5m: nonnegative(volume.m5), volume15m: 0, buys5m: nonnegative(txns.buys), sells5m: nonnegative(txns.sells), buyers5m: null, sellers5m: null }
  };
}

export async function fetchMint(mint: string, now = Date.now(), followPool = false): Promise<Token> {
  if (!mintPattern.test(mint)) throw new Error('Invalid Solana mint address.');
  const found = cache.get(mint);
  if (found && now - found.at < 30_000) return found.token;

  if (now >= retryAfter) {
    try {
      const dex = await requestDexScreener(mint, now);
      const dexWithFlow = await withSolFlow(dex, now);
      if (dexWithFlow.poolAddresses?.length) { cache.set(mint, { at: now, token: dexWithFlow }); return dexWithFlow; }
      // DexScreener had no pool for this mint; GeckoTerminal can still supply one.
      const gecko = await requestGeckoToken(mint, now);
      const token = gecko ? await withSolFlow(gecko, now) : dexWithFlow;
      // A pool is not a token. Axiom's token pages put the *pool* address in the URL
      // (/meme/<pool>), so asking for it as a mint finds nothing at all while the coin
      // is trading fine. One extra lookup turns the pool back into the token it holds.
      if (followPool && isUnidentifiedToken(token)) {
        const held = await resolvePoolToken(mint);
        if (held) {
          const resolved = await fetchMint(held, now);
          if (!isUnidentifiedToken(resolved)) { cache.set(mint, { at: now, token: resolved }); return resolved; }
        }
      }
      cache.set(mint, { at: now, token });
      return token;
    } catch (cause) {
      const gecko = await requestGeckoToken(mint, now);
      if (gecko) {
        const enriched = await withSolFlow(gecko, now);
        cache.set(mint, { at: now, token: enriched });
        return enriched;
      }
      throw cause;
    }
  }

  const gecko = await requestGeckoToken(mint, now);
  if (gecko) {
    const enriched = await withSolFlow(gecko, now);
    cache.set(mint, { at: now, token: enriched });
    return enriched;
  }
  throw new Error('DEX Screener is rate limited; waiting before retry.');
}

async function withSolFlow(token: Token, now: number): Promise<Token> {
  const pool = token.poolAddresses?.[0];
  if (!pool) return token;
  const flow = await fetchSolFlow(pool, token.quoteSymbol, now).catch(() => null);
  return flow ? { ...token, solFlow5m: flow } : token;
}

/** DexScreener's pair endpoint: a pool address in, the token it trades out. */
const pairEndpoint = 'https://api.dexscreener.com/latest/dex/pairs/solana';

/**
 * The mint of the token a pool address trades, or null when it is not a known pool.
 *
 * Deliberately returns a *different* address only: if the lookup address is already a
 * token, this must not invent a second identity for it.
 */
async function resolvePoolToken(address: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${pairEndpoint}/${address}`, { signal: controller.signal });
    if (!response.ok) return null;
    const payload = await response.json();
    const pairs = obj(payload)?.pairs;
    const base = Array.isArray(pairs) ? obj(obj(pairs[0])?.baseToken) : null;
    const held = str(base?.address);
    return held && held !== address && mintPattern.test(held) ? held : null;
  } catch { return null; }
  finally { clearTimeout(timeout); }
}

async function requestDexScreener(mint: string, now: number): Promise<Token> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://api.dexscreener.com/token-pairs/v1/solana/${mint}`, { signal: controller.signal });
    if (response.status === 429) {
      retryAfter = Date.now() + 60_000;
      throw new Error('DEX Screener is rate limited; waiting before retry.');
    }
    if (!response.ok) throw new Error(`DEX Screener HTTP ${response.status}`);
    return parseDexPairs(await response.json(), mint, now);
  } catch (cause) {
    if (cause instanceof Error && cause.name === 'AbortError') throw new Error('DEX Screener lookup timed out.');
    throw cause;
  } finally { clearTimeout(timeout); }
}

async function requestGeckoToken(mint: string, now: number): Promise<Token | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      // `include` is required here for the same reason as the live feed: without it the
      // payload carries only the ids of the related token and dex resources, so the
      // coin's own name, symbol and quote asset all come back empty and the fallback
      // produced a token called "?" with no platform.
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?include=base_token,quote_token,dex&page=1`,
      { headers: { Accept: 'application/json;version=20230203' }, signal: controller.signal }
    );
    if (!response.ok) return null;
    return parseGeckoTokenPools(await response.json(), mint, now);
  } catch { return null; }
  finally { clearTimeout(timeout); }
}

/** Fallback market data from the documented GeckoTerminal token-pools endpoint. */
export function parseGeckoTokenPools(payload: unknown, mint: string, now: number): Token | null {
  if (!mintPattern.test(mint)) return null;
  const response = obj(payload);
  if (!Array.isArray(response.data) || response.data.length === 0) return null;
  const included = new Map<string, Obj>();
  for (const item of Array.isArray(response.included) ? response.included : []) {
    const entry = obj(item);
    const id = str(entry.id);
    if (id) included.set(id, obj(entry.attributes));
  }
  let best: { attrs: Obj; poolAddress: string; dexId: string | null; quoteId: string | null } | null = null;
  let bestReserve = -1;
  for (const item of response.data) {
    const pool = obj(item);
    const attrs = obj(pool.attributes);
    const poolAddress = str(attrs.address);
    if (!poolAddress) continue;
    const reserve = num(attrs.reserve_in_usd) ?? 0;
    if (reserve > bestReserve) {
      const relations = obj(pool.relationships);
      const dex = obj(obj(relations.dex).data);
      const quote = obj(obj(relations.quote_token).data);
      bestReserve = reserve;
      best = { attrs, poolAddress, dexId: str(dex.id), quoteId: str(quote.id) };
    }
  }
  if (!best) return null;

  const { attrs, poolAddress, dexId, quoteId } = best;
  const tokenAttrs = included.get(`solana_${mint}`) ?? {};
  const quoteSymbol = quoteId ? str(included.get(quoteId)?.symbol) : null;
  const transactions = obj(obj(attrs.transactions).m5);
  const volume = obj(attrs.volume_usd);
  const priceChanges = obj(attrs.price_change_percentage);
  const createdAt = Date.parse(str(attrs.pool_created_at) ?? '');
  const liquidityUsd = num(attrs.reserve_in_usd);
  return {
    mint, chain: 'solana', poolAddresses: [poolAddress],
    name: str(tokenAttrs.name) ?? mint.slice(0, 6), symbol: str(tokenAttrs.symbol) ?? '?',
    stage: 'unknown', launchedAt: Number.isFinite(createdAt) && createdAt <= now + 60_000 ? createdAt : null,
    observedAt: now,
    priceUsd: num(attrs.base_token_price_usd), marketCapUsd: num(attrs.market_cap_usd), fdvUsd: num(attrs.fdv_usd),
    liquidityUsd: liquidityUsd !== null && liquidityUsd >= 0 ? liquidityUsd : null,
    liquidityChangePct: null, priceChange5mPct: num(priceChanges.m5), imageUrl: str(tokenAttrs.image_url),
    trades: [], holders: null,
    developer: { creator: null, priorLaunches: null, rapidFailures: null, linkedSales: null, source: 'unknown', note: 'GeckoTerminal pools do not verify creator wallets or token controls.' },
    mintAuthority: null, freezeAuthority: null, transferRestriction: null, migrationProgressPct: null,
    provider: 'GeckoTerminal token pools',
    sourceUrl: `https://www.geckoterminal.com/solana/pools/${poolAddress}`,
    dexName: dexId ? dexId.replace(/^solana_/, '') : null, quoteSymbol, liquiditySol: null,
    marketSnapshot: {
      volume5m: nonnegative(volume.m5), volume15m: nonnegative(volume.m15),
      buys5m: nonnegative(transactions.buys), sells5m: nonnegative(transactions.sells),
      buyers5m: nonnegative(transactions.buyers), sellers5m: nonnegative(transactions.sellers)
    }
  };
}

export async function fetchTrackedTokens(mints: string[], now = Date.now()): Promise<{ tokens: Token[]; errors: string[] }> {
  const settled = await Promise.allSettled(mints.slice(0, 5).map(mint => fetchMint(mint, now)));
  const tokens: Token[] = [], errors: string[] = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') tokens.push(result.value);
    else {
      const mint = mints[index];
      if (mint) tokens.push(unknownToken(mint, now, 'Market lookup unavailable; no fresh metrics or security evidence.'));
      errors.push(result.reason instanceof Error ? result.reason.message : 'Market lookup failed.');
    }
  });
  return { tokens, errors };
}
