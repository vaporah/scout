import { mintPattern } from './dex.js';
import type { HolderShare } from './types.js';
/**
 * Largest holder accounts from a Solana-native token report feed.
 *
 * Scout's other two holder sources only describe a token once it has been indexed and
 * has traded for a while, which is exactly the window — minutes after launch — where
 * concentration matters most and where the popup currently has nothing to show. This
 * source answers for a token that is only a few minutes old.
 *
 * The trap this module exists to avoid: on a new token the largest account is almost
 * always the pool or bonding-curve vault, not a person. Read naively, every fresh
 * launch would report "one wallet holds 99% of the supply", which is a false alarm
 * rather than a finding. So an account holding at or above `vaultLikePct` of supply is
 * typed as a pool unless the feed positively identifies it as an insider wallet.
 * The percentage is shown either way; only the claim about *who* holds it changes.
 */

export const holderReportEndpoint = 'https://api.rugcheck.xyz/v1/tokens';
/** At or above this share, a single account is far more likely a vault than a wallet. */
export const vaultLikePct = 50;
const cacheMs = 120_000;
const negativeCacheMs = 30_000;
const maxRequestsPerMinute = 20;
/**
 * Generous, because this call is not waited on unless it is needed. A cold report
 * takes around four seconds and the feed caches it server-side afterwards (about
 * 120ms), so a short timeout would abort precisely the call that matters. An
 * established token can take over ten seconds, which is why nothing blocks on it.
 */
const requestTimeoutMs = 7_000;
/** The feed publishes up to 20 accounts; more than this is noise in a popup. */
const maxAccounts = 20;

export interface HolderAccounts {
  /** Total number of holders, when the feed reports it. */
  count: number | null;
  /** Largest accounts first, each as a share of total supply. */
  accounts: HolderShare[];
  /** Token identity and market figures, when the report carries them. */
  meta: ReportMeta | null;
}

/**
 * What a report says about the coin itself.
 *
 * Deliberately limited to fields that were checked against a known token: the price,
 * liquidity, name and symbol all match reality. The report also carries `mintAuthority`
 * and `freezeAuthority`, but those come back null for every coin sampled including
 * fresh ones, so reading a null as "revoked" would mark anything as safe. They are left
 * alone until they can be told apart from "not reported".
 */
export interface ReportMeta {
  name: string | null;
  symbol: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
  /** The wallet that deployed the mint, when the report names one. */
  creator: string | null;
  /**
   * Share of supply the creator still holds, or null when it cannot be worked out.
   * A reported zero is a real answer here and is kept as 0: it means the deployer has
   * sold out or never held any, which is exactly what is worth knowing.
   */
  creatorHoldingPct: number | null;
}

const cache = new Map<string, { at: number; value: HolderAccounts | null }>();
let requestTimes: number[] = [];
let retryAfter = 0;

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const finiteNumber = (value: unknown): number | null => {
  const number = typeof value === 'string' && value.trim() ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(number) ? number : null;
};

/**
 * A reported zero is not a measurement: a price of 0 would claim the coin is worthless
 * rather than unpriced, and the same goes for liquidity.
 */
const positive = (value: unknown): number | null => {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
};

/** Read the coin's identity and market figures, or null when there are none usable. */
export function parseReportMeta(payload: unknown, mint: string): ReportMeta | null {
  const report = object(payload);
  if (!report) return null;
  // A report naming a different mint says nothing about this one.
  if (typeof report.mint !== 'string' || report.mint !== mint) return null;
  const meta = object(report.tokenMeta);
  const name = typeof meta?.name === 'string' && meta.name.trim() ? meta.name.trim() : null;
  const symbol = typeof meta?.symbol === 'string' && meta.symbol.trim() ? meta.symbol.trim() : null;
  const priceUsd = positive(report.price);
  const liquidityUsd = positive(report.totalMarketLiquidity);
  const creatorValue = typeof report.creator === 'string' ? report.creator : null;
  const creator = creatorValue && mintPattern.test(creatorValue) ? creatorValue : null;
  // Balance and supply are both in raw units, so the ratio needs no decimal adjustment.
  const balance = finiteNumber(report.creatorBalance);
  const supply = finiteNumber(object(report.token)?.supply);
  const creatorHoldingPct = balance !== null && supply !== null && supply > 0
    ? Math.max(0, balance) / supply * 100
    : null;
  if (name === null && symbol === null && priceUsd === null && liquidityUsd === null && creator === null && creatorHoldingPct === null) return null;
  return { name, symbol, priceUsd, liquidityUsd, creator, creatorHoldingPct };
}

/**
 * Read a holder report. Returns null rather than a partial guess when the report is
 * for a different mint, which is the one failure that would attach another coin's
 * concentration to this one.
 */
export function parseHolderReport(payload: unknown, mint: string): HolderAccounts | null {
  const report = object(payload);
  if (!report) return null;
  // A report that names a different mint is unusable, however plausible it looks.
  if (typeof report.mint !== 'string' || report.mint !== mint) return null;

  const rawCount = finiteNumber(report.totalHolders);
  const count = rawCount !== null && rawCount > 0 ? Math.floor(rawCount) : null;

  const listed = Array.isArray(report.topHolders) ? report.topHolders : [];
  const seen = new Set<string>();
  const accounts: HolderShare[] = [];
  for (const entry of listed) {
    const holder = object(entry);
    if (!holder) continue;
    const pct = finiteNumber(holder.pct);
    if (pct === null || pct <= 0) continue;
    // Prefer the owning wallet; the bare address is the token account itself.
    const owner = typeof holder.owner === 'string' && mintPattern.test(holder.owner) ? holder.owner : null;
    const address = typeof holder.address === 'string' && mintPattern.test(holder.address) ? holder.address : null;
    const wallet = owner ?? address;
    if (!wallet || seen.has(wallet)) continue;
    seen.add(wallet);
    // An insider flag outweighs the size heuristic: a person can legitimately hold most
    // of a supply, and that is a finding rather than a vault to be explained away.
    const insider = holder.insider === true;
    accounts.push({
      wallet,
      pct,
      type: pct >= vaultLikePct && !insider ? 'pool' : 'wallet',
      tag: null,
      locked: false
    });
  }

  accounts.sort((a, b) => b.pct - a.pct);
  const trimmed = accounts.slice(0, maxAccounts);
  const meta = parseReportMeta(payload, mint);
  // A report can describe the coin without listing any of its holders, and the other
  // way round; it is only useless when it has neither.
  if (!trimmed.length && count === null && !meta) return null;
  return { count, accounts: trimmed, meta };
}

/**
 * Start a report without waiting for it.
 *
 * The caller cannot know it needs this report until the other providers have answered,
 * and asking afterwards costs the whole round trip in series on the slowest scans. So
 * the request is set going alongside them, and only awaited if it turns out to be
 * needed — by which time it has had the length of the main scan to finish.
 */
export function warmHolderAccounts(mint: string, now: number): void {
  void fetchHolderAccounts(mint, now).catch(() => { /* a missing report is not an error */ });
}

/**
 * The report in flight for a mint, shared so the warm-up and the decision to use it
 * cannot turn into two requests.
 */
const inFlight = new Map<string, Promise<HolderAccounts | null>>();

/** Best-effort lookup. Never throws: a missing holder report is not a scan failure. */
export function fetchHolderAccounts(mint: string, now: number): Promise<HolderAccounts | null> {
  const running = inFlight.get(mint);
  if (running) return running;
  const request = loadHolderAccounts(mint, now).finally(() => { inFlight.delete(mint); });
  inFlight.set(mint, request);
  return request;
}

async function loadHolderAccounts(mint: string, now: number): Promise<HolderAccounts | null> {
  if (!mintPattern.test(mint)) return null;
  const previous = cache.get(mint);
  if (previous && now - previous.at < (previous.value ? cacheMs : negativeCacheMs)) return previous.value;
  requestTimes = requestTimes.filter(at => now - at < 60_000);
  if (now < retryAfter || requestTimes.length >= maxRequestsPerMinute) return null;
  requestTimes.push(now);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${holderReportEndpoint}/${encodeURIComponent(mint)}/report`, {
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    if (response.status === 429 || response.status === 503) {
      const seconds = Number(response.headers.get('Retry-After'));
      retryAfter = now + (Number.isFinite(seconds) && seconds > 0 ? Math.min(300, seconds) : response.status === 429 ? 60 : 30) * 1000;
      cache.set(mint, { at: now, value: null });
      return null;
    }
    if (!response.ok) {
      // An established token is refused outright by this feed. That is a missing
      // answer, not a failed scan, so it is remembered and not retried in a hurry.
      cache.set(mint, { at: now, value: null });
      return null;
    }
    const value = parseHolderReport(await response.json(), mint);
    cache.set(mint, { at: now, value });
    return value;
  } catch {
    cache.set(mint, { at: now, value: null });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Test seam: drop cached reports, in-flight requests and the request budget. */
export function resetHolderAccountCache(): void {
  cache.clear();
  inFlight.clear();
  requestTimes = [];
  retryAfter = 0;
}
