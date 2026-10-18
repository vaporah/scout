export interface AthInfo {
  priceUsd: number;
  at: number | null;
  source: string;
}

const poolCache = new Map<string, { at: number; info: AthInfo | null }>();
const cacheMs = 300_000;

type Obj = Record<string, unknown>;
const object = (value: unknown): Obj | null => value !== null && typeof value === 'object' ? value as Obj : null;

/** Highest candle high in a GeckoTerminal OHLCV response; at = its candle time (ms). */
export function parseOhlcvAth(payload: unknown): AthInfo | null {
  const attributes = object(object(object(payload)?.data)?.attributes);
  const list = attributes?.ohlcv_list ?? attributes?.ohlcv;
  if (!Array.isArray(list)) return null;
  let high = 0;
  let at: number | null = null;
  for (const candle of list) {
    if (!Array.isArray(candle) || candle.length < 3) continue;
    const value = Number(candle[2]);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (value > high) {
      high = value;
      const seconds = Number(candle[0]);
      at = Number.isFinite(seconds) ? seconds * 1000 : null;
    }
  }
  return high > 0 ? { priceUsd: high, at, source: 'GeckoTerminal daily high' } : null;
}

/** All-time high from the public GeckoTerminal OHLCV endpoint for one Solana pool. */
export async function fetchAth(poolAddress: string | null | undefined, now = Date.now()): Promise<AthInfo | null> {
  if (!poolAddress || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(poolAddress)) return null;
  const cached = poolCache.get(poolAddress);
  if (cached && now - cached.at < cacheMs) return cached.info;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/day?limit=1000&currency=usd`,
        { headers: { Accept: 'application/json;version=20230203' }, signal: controller.signal }
      );
      if (!response.ok) {
        poolCache.set(poolAddress, { at: now, info: null });
        return null;
      }
      const info = parseOhlcvAth(await response.json());
      poolCache.set(poolAddress, { at: now, info });
      return info;
    } finally { clearTimeout(timeout); }
  } catch {
    return null;
  }
}
