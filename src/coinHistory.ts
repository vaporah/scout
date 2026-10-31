import type { Token } from './types.js';

/** A coin Scout has observed at least once, with the highest values it recorded. */
export interface CoinObservation {
  mint: string;
  symbol: string;
  name: string;
  firstSeenAt: number;
  lastSeenAt: number;
  highPriceUsd: number | null;
  highMarketCapUsd: number | null;
  highAt: number | null;
}

/** Bounded history summary shown in the token popup. */
export interface TokenHistoryView {
  ath: { priceUsd: number; at: number | null; source: string } | null;
  observedHigh: { priceUsd: number | null; marketCapUsd: number | null; at: number | null } | null;
  similar: { mint: string; symbol: string; name: string; firstSeenAt: number; source: 'observed' | 'feed' }[];
  /** True when the public feed was actually searched for same-ticker pools. */
  feedChecked: boolean;
}

const key = 'scout.coinHistory.v1';
const maxRecords = 400;

interface StorageApi {
  storage?: { local?: {
    get(key: string): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void> | void;
  } };
}

const api = (): StorageApi | undefined => (globalThis as typeof globalThis & { chrome?: StorageApi }).chrome;

const identity = (symbol: string, name: string): string =>
  `${String(symbol ?? '').trim().toUpperCase()}|${String(name ?? '').trim().toLowerCase()}`;

export function coinIdentity(token: Pick<Token, 'symbol' | 'name'>): string {
  return identity(token.symbol, token.name);
}

/**
 * Count observed mints by coin identity once for a whole row render. Consumers
 * subtract the current mint when it is already present in history. This avoids
 * rescanning the bounded history for every visible trading card.
 */
export function coinIdentityCounts(history: CoinObservation[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of history) {
    const key = identity(record.symbol, record.name);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export async function loadCoinHistory(): Promise<CoinObservation[]> {
  try {
    const value = (await api()?.storage?.local?.get(key))?.[key];
    if (!Array.isArray(value)) return [];
    return value.filter((record): record is CoinObservation =>
      !!record && typeof record === 'object'
      && typeof (record as CoinObservation).mint === 'string'
      && typeof (record as CoinObservation).firstSeenAt === 'number');
  } catch { return []; }
}

async function save(records: CoinObservation[]): Promise<void> {
  try { await api()?.storage?.local?.set({ [key]: records }); }
  catch { /* history is best-effort and must never block analysis */ }
}

/** Record every freshly analysed live token so Scout can spot repeats and observed highs. */
export async function recordObservations(tokens: Token[], now = Date.now()): Promise<void> {
  const byMint = new Map((await loadCoinHistory()).map(record => [record.mint, record]));
  for (const token of tokens) {
    if (!token.mint || token.provider === 'SIMULATED DEMO') continue;
    const price = token.priceUsd;
    const cap = token.marketCapUsd;
    const existing = byMint.get(token.mint);
    if (!existing) {
      byMint.set(token.mint, {
        mint: token.mint, symbol: token.symbol, name: token.name,
        firstSeenAt: now, lastSeenAt: now,
        highPriceUsd: price, highMarketCapUsd: cap, highAt: price !== null || cap !== null ? now : null
      });
      continue;
    }
    existing.lastSeenAt = now;
    existing.symbol = token.symbol;
    existing.name = token.name;
    if (price !== null && (existing.highPriceUsd === null || price > existing.highPriceUsd)) {
      existing.highPriceUsd = price;
      existing.highAt = now;
    }
    if (cap !== null && (existing.highMarketCapUsd === null || cap > existing.highMarketCapUsd)) {
      existing.highMarketCapUsd = cap;
      existing.highAt = now;
    }
  }
  const list = [...byMint.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt).slice(0, maxRecords);
  await save(list);
}

/** Similar = same symbol and name as another mint. Oldest first. */
export function summarizeHistory(history: CoinObservation[], token: Token, ath: TokenHistoryView['ath'] = null): TokenHistoryView {
  const wanted = coinIdentity(token);
  const similar = history
    .filter(record => record.mint !== token.mint && identity(record.symbol, record.name) === wanted)
    .sort((a, b) => a.firstSeenAt - b.firstSeenAt);
  const self = history.find(record => record.mint === token.mint) ?? null;
  return {
    ath,
    observedHigh: self && (self.highPriceUsd !== null || self.highMarketCapUsd !== null)
      ? { priceUsd: self.highPriceUsd, marketCapUsd: self.highMarketCapUsd, at: self.highAt }
      : null,
    similar: similar.map(record => ({ mint: record.mint, symbol: record.symbol, name: record.name, firstSeenAt: record.firstSeenAt, source: 'observed' as const })),
    feedChecked: false
  };
}

export interface VampirePoolInput {
  pools: { mint: string; symbol: string; name: string }[];
  /** Whether the public feed was searched, so the popup can word the answer honestly. */
  feedChecked: boolean;
  /** The coin being viewed, which is never one of its own copies. */
  excludeMint?: string | null;
}

/**
 * Add the same-ticker pools found on the public feed to a history view. Observed coins
 * win when a mint appears in both, the viewed coin is never listed as its own copy, and
 * the view records whether the feed was searched at all.
 */
export function mergeVampirePools(view: TokenHistoryView, input: VampirePoolInput, now = Date.now()): TokenHistoryView {
  const merged = new Map(view.similar.map(item => [item.mint, item]));
  for (const pool of input.pools) {
    if (pool.mint === input.excludeMint || merged.has(pool.mint)) continue;
    merged.set(pool.mint, { mint: pool.mint, symbol: pool.symbol, name: pool.name, firstSeenAt: now, source: 'feed' });
  }
  return {
    ...view,
    similar: [...merged.values()].sort((a, b) => a.firstSeenAt - b.firstSeenAt).slice(0, 8),
    feedChecked: input.feedChecked || view.feedChecked
  };
}
