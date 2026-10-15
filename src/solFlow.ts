import type { SolFlow5m } from './types.js';

const addressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type Obj = Record<string, unknown>;
const obj = (value: unknown): Obj => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Obj : {};
const number = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const isSol = (symbol: string | null | undefined): boolean => ['SOL', 'WSOL'].includes(symbol?.trim().toUpperCase() ?? '');

const cache = new Map<string, { at: number; value: SolFlow5m | null }>();
let requests: number[] = [];
let retryAfter = 0;
const cacheMs = 30_000;
const negativeCacheMs = 15_000;
const maxRequestsPerMinute = 20;

/** Parse GeckoTerminal's exact-pool five-minute buy/sell volume breakdown. */
export function parseSolFlow(payload: unknown, quoteSymbol: string | null | undefined, now: number): SolFlow5m | null {
  if (!isSol(quoteSymbol)) return null;
  const attributes = obj(obj(obj(payload).data).attributes);
  const solUsd = number(attributes.quote_token_price_usd);
  if (solUsd === null || solUsd <= 0) return null;

  const netUsdPublished = number(obj(attributes.net_buy_volume_usd).m5);
  const buyUsd = number(obj(attributes.buy_volume_usd).m5);
  const sellUsd = number(obj(attributes.sell_volume_usd).m5);
  const netUsd = netUsdPublished ?? (buyUsd !== null && sellUsd !== null ? buyUsd - sellUsd : null);
  if (netUsd === null && buyUsd === null && sellUsd === null) return null;

  return {
    netSol: netUsd !== null ? netUsd / solUsd : 0,
    buySol: buyUsd !== null && buyUsd >= 0 ? buyUsd / solUsd : null,
    sellSol: sellUsd !== null && sellUsd >= 0 ? sellUsd / solUsd : null,
    observedAt: now,
    source: 'GeckoTerminal exact-pool 5m volume breakdown'
  };
}

/** Best-effort exact-pool flow lookup with a bounded request budget. */
export async function fetchSolFlow(poolAddress: string, quoteSymbol: string | null | undefined, now: number): Promise<SolFlow5m | null> {
  if (!addressPattern.test(poolAddress) || !isSol(quoteSymbol)) return null;
  const previous = cache.get(poolAddress);
  if (previous && now - previous.at < (previous.value ? cacheMs : negativeCacheMs)) return previous.value;
  requests = requests.filter(at => now - at < 60_000);
  if (now < retryAfter || requests.length >= maxRequestsPerMinute) return null;
  requests.push(now);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${encodeURIComponent(poolAddress)}?include_volume_breakdown=true`,
      { headers: { Accept: 'application/json;version=20230203' }, signal: controller.signal }
    );
    if (response.status === 429) {
      retryAfter = now + 60_000;
      cache.set(poolAddress, { at: now, value: null });
      return null;
    }
    if (!response.ok) {
      cache.set(poolAddress, { at: now, value: null });
      return null;
    }
    const value = parseSolFlow(await response.json(), quoteSymbol, now);
    cache.set(poolAddress, { at: now, value });
    return value;
  } catch {
    cache.set(poolAddress, { at: now, value: null });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function resetSolFlowCache(): void {
  cache.clear();
  requests = [];
  retryAfter = 0;
}
