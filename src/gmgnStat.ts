import { mintPattern } from './dex.js';
import type { HolderQuality } from './types.js';

/**
 * Holder figures from GMGN's own token-stat endpoint.
 *
 * This is the data the GMGN and Axiom UIs show, so it fills the gaps the other sources
 * leave: a holder count, how concentrated the top ten are, and what the deployer still
 * holds. It has to be read from the extension's background worker rather than a script,
 * because the endpoint answers a real browser and refuses anything else.
 *
 * Two guards matter here:
 *  - every rate comes back as a *fraction in a string* ("0.2122" means 21.22%), so it is
 *    converted once, and only when it really is a fraction. Anything above 1 is not
 *    understood and becomes unknown rather than being guessed at.
 *  - a top-ten rate of zero is not a measurement: on a token where the pool holds
 *    almost everything, this source still reports 0. Understating concentration is the
 *    dangerous direction for a risk readout, so a zero is treated as "not published"
 *    and left to a source that can actually see the wallets.
 */

export const gmgnStatEndpoint = 'https://gmgn.ai/api/v1/token_stat/sol';
const cacheMs = 120_000;
const negativeCacheMs = 30_000;
const maxRequestsPerMinute = 20;
/** Kept short: this is a top-up, and a slow top-up must never hold up a scan. */
const requestTimeoutMs = 5_000;

export interface GmgnStats {
  holderCount: number | null;
  top10Pct: number | null;
  creatorHoldingPct: number | null;
  /** Who is holding, as opposed to how much: see `HolderQuality`. */
  quality: HolderQuality | null;
}

const cache = new Map<string, { at: number; value: GmgnStats | null }>();
let requestTimes: number[] = [];
let retryAfter = 0;

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const finiteNumber = (value: unknown): number | null => {
  const number = typeof value === 'string' && value.trim() ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(number) ? number : null;
};

/**
 * A fraction in a string, as a percentage. Returns null for a missing value, for zero
 * where zero means "not computed", and for anything outside the fraction range.
 */
function rate(value: unknown, { allowZero }: { allowZero: boolean }): number | null {
  const parsed = finiteNumber(value);
  if (parsed === null || parsed < 0 || parsed > 1) return null;
  if (parsed === 0 && !allowZero) return null;
  // Rounded here rather than at the point of display: multiplying a fraction in binary
  // turns 0.0341 into 3.4099999999999997, and every consumer would otherwise have to
  // know that. No share needs more than four decimal places.
  return Math.round(parsed * 100 * 10_000) / 10_000;
}

/** Read the figures, or null when the payload says nothing usable about this mint. */
export function parseGmgnStats(payload: unknown): GmgnStats | null {
  const body = object(payload);
  // The endpoint reports its own failures as code 0 (success) or anything else.
  if (!body || body.code !== 0) return null;
  const data = object(body.data);
  if (!data) return null;

  const countValue = finiteNumber(data.holder_count);
  // A holder count of zero would be a claim that nobody holds the coin.
  const holderCount = countValue !== null && countValue > 0 ? Math.floor(countValue) : null;
  // A deployer holding nothing is a real finding about one wallet, so a zero is kept
  // here — unlike the top-ten rate below, where a zero means "not computed".
  const creatorHoldingPct = rate(data.creator_hold_rate, { allowZero: true });
  const top10Pct = rate(data.top_10_holder_rate, { allowZero: false });

  // These all measure how much of the supply is in questionable hands, so a zero would
  // claim the coin is clean: an understated bad reading is the dangerous direction here,
  // and it is left unknown instead.
  const launches = finiteNumber(data.creator_created_count);
  const quality: HolderQuality = {
    devLaunches: launches !== null && launches >= 0 ? Math.floor(launches) : null,
    bundlerPct: rate(data.top_bundler_trader_percentage, { allowZero: false }),
    sniperPct: rate(data.top70_sniper_hold_rate, { allowZero: false }),
    botDegenPct: rate(data.bot_degen_rate, { allowZero: false }),
    freshWalletPct: rate(data.fresh_wallet_rate, { allowZero: false })
  };
  const hasQuality = Object.values(quality).some(value => value !== null);

  if (holderCount === null && creatorHoldingPct === null && top10Pct === null && !hasQuality) return null;
  return { holderCount, top10Pct, creatorHoldingPct, quality: hasQuality ? quality : null };
}

/** Best-effort lookup. Never throws: a missing stat is not a scan failure. */
export async function fetchGmgnStats(mint: string, now: number): Promise<GmgnStats | null> {
  if (!mintPattern.test(mint)) return null;
  const previous = cache.get(mint);
  if (previous && now - previous.at < (previous.value ? cacheMs : negativeCacheMs)) return previous.value;
  requestTimes = requestTimes.filter(at => now - at < 60_000);
  if (now < retryAfter || requestTimes.length >= maxRequestsPerMinute) return null;
  requestTimes.push(now);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${gmgnStatEndpoint}/${encodeURIComponent(mint)}`, {
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    if (response.status === 429 || response.status === 503) {
      const seconds = Number(response.headers.get('Retry-After'));
      retryAfter = now + (Number.isFinite(seconds) && seconds > 0 ? Math.min(300, seconds) : response.status === 429 ? 60 : 30) * 1000;
      cache.set(mint, { at: now, value: null });
      return null;
    }
    // A blocked or refused request is a missing answer, not a failed scan.
    if (!response.ok) {
      cache.set(mint, { at: now, value: null });
      return null;
    }
    const value = parseGmgnStats(await response.json());
    cache.set(mint, { at: now, value });
    return value;
  } catch {
    cache.set(mint, { at: now, value: null });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Test seam: drop cached figures and the request budget. */
export function resetGmgnStatCache(): void {
  cache.clear();
  requestTimes = [];
  retryAfter = 0;
}
