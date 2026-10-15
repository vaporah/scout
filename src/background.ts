import { assessTokens } from './analysis.js';
import { fetchAth, type AthInfo } from './ath.js';
import { recordObservations } from './coinHistory.js';
import { fetchMint, isUnidentifiedToken, mintPattern } from './dex.js';
import { fetchGmgnStats } from './gmgnStat.js';
import { enrichTokensWithGoPlus } from './goplus.js';
import { assessMintsMessage } from './messages.js';
import { defaults, validSettings } from './settings.js';
import { fetchTokenInfo } from './tokenInfo.js';
import { fetchHolderAccounts, warmHolderAccounts } from './rugcheck.js';
import type { Assessment, Settings, Token } from './types.js';
import { fetchVampPools, type VampPool } from './vamps.js';

/**
 * Merge the feed's per-token detail into a token: holder distribution bands, the
 * developer's address, and the developer's own share of supply.
 *
 * The developer address is recorded but `developer.source` stays 'unknown'. That is
 * deliberate: an address is not a launch history, and flipping the source would move
 * the developer score and the entry conditions for every token the feed describes.
 * The popup gets a real wallet to show without the verdict quietly changing.
 */
function withTokenInfo(token: Token, info: Awaited<ReturnType<typeof fetchTokenInfo>>): Token {
  if (!info) return token;
  const creator = token.developer.creator ?? info.developerAddress;
  return {
    ...token,
    holderCount: token.holderCount ?? info.holderCount,
    holderBands: info.bands,
    developerHoldingPct: info.developerHoldingPct,
    developer: creator === token.developer.creator
      ? token.developer
      : { ...token.developer, creator, note: `${token.developer.note} Creator address supplied by GeckoTerminal; its launch history is still unverified.`.trim() }
  };
}

export const maxScanMints = 12;
const settingsKey = 'scout.settings.v1';
const lookupConcurrency = 4;

/**
 * Fill in the holder and developer figures that the ordinary sources did not supply.
 *
 * Both market indexers have gaps: DEX Screener can be minutes behind a launch, and the
 * GeckoTerminal per-token endpoint has no pool at all for some coins. When neither has
 * one, Scout used to end up with a token that had no identity and no figures. The
 * popup showed a scorecard of "Unknown" and a 0/100 score, which reads as a broken
 * extension rather than as a missing listing.
 *
 * Two top-up sources cover that gap together: a Solana token report that names the coin
 * and the wallet that deployed it, and GMGN's token-stat endpoint (the figures the GMGN
 * and Axiom UIs show) for a holder count, top-ten concentration and what the deployer
 * still holds.
 *
 * Requested only once the ordinary sources have come up short, and only for a token
 * page. Asking up front looked cheaper but was not: the report is quick for a brand-new
 * token and slow enough to blow the scan timeout for an established one, and an
 * established token never needs it because the other providers already answered.
 */
async function withFallbackReport(token: Token, now: number): Promise<Token> {
  const startedUnidentified = isUnidentifiedToken(token);
  const hasMarket = (token.poolAddresses?.length ?? 0) > 0;
  const hasHolders = (token.holders?.length ?? 0) > 0 || token.holderBands != null || typeof token.holderCount === 'number';
  const hasTop10 = token.holderBands?.top10 != null || token.top10HoldPct != null;
  if (hasMarket && hasHolders && hasTop10 && typeof token.developerHoldingPct === 'number') return token;
  // The holder report is warmed when a token page starts, but it can take several
  // seconds. GMGN's compact token stat is usually fast and already supplies enough
  // holder context to make the Axiom page useful, so do not hold that answer behind
  // the slower report.
  const stats = await fetchGmgnStats(token.mint, now).catch(() => null);
  let next = token;
  // What the deployer still holds, the figure the popup's Dev row kept missing.
  if (stats?.creatorHoldingPct != null && next.developerHoldingPct == null) {
    next = { ...next, developerHoldingPct: stats.creatorHoldingPct };
  }
  if (stats?.holderCount != null && next.holderCount == null) {
    next = { ...next, holderCount: stats.holderCount };
  }
  if (stats?.top10Pct != null && !hasTop10) {
    next = { ...next, top10HoldPct: stats.top10Pct };
  }
  if (stats?.quality && !next.holderQuality) {
    next = { ...next, holderQuality: stats.quality };
  }
  // Return early only for the page that had no public market identity at all. A normal
  // pool still benefits from the detailed report because it can name the creator and
  // fill in a real holder list, even when GMGN supplied a quick headline figure.
  if (startedUnidentified && !isUnidentifiedToken(next)) return next;

  // No quick contextual answer arrived. The already-warmed detailed report is now
  // worth awaiting because it is the remaining way to name or describe this mint.
  const found = await fetchHolderAccounts(token.mint, now).catch(() => null);
  if (!found) return next;
  if (!hasMarket && found.meta) {
    // Nothing else described this coin, so the name here replaces the truncated mint.
    next = {
      ...next,
      name: found.meta.name ?? next.name,
      symbol: found.meta.symbol ?? next.symbol,
      priceUsd: next.priceUsd ?? found.meta.priceUsd,
      liquidityUsd: next.liquidityUsd ?? found.meta.liquidityUsd,
      provider: `${next.provider} + Solana token report`
    };
  }
  // The developer is the one part of the popup that stayed empty for most fresh coins,
  // and this report names the deploying wallet and what it still holds. `source` is
  // deliberately left alone: it is what the developer score and the entry conditions
  // read, and knowing an address is not the same as having a launch history, so the
  // verdict must not move just because a wallet is now on screen.
  if (found.meta && (next.developer.creator === null && found.meta.creator !== null
    || next.developerHoldingPct == null && found.meta.creatorHoldingPct !== null)) {
    next = {
      ...next,
      developerHoldingPct: next.developerHoldingPct ?? found.meta.creatorHoldingPct,
      developer: next.developer.creator === null && found.meta.creator !== null
        ? { ...next.developer, creator: found.meta.creator, note: `${next.developer.note} Creator address supplied by the Solana token report; its launch history is still unverified.`.trim() }
        : next.developer
    };
  }
  if (!hasHolders && (found.accounts.length > 0 || found.count !== null)) {
    next = {
      ...next,
      holders: found.accounts.length ? found.accounts : next.holders,
      holderCount: next.holderCount ?? found.count
    };
  }
  return next;
}

export interface ScanResponse {
  assessments: Assessment[];
  settings: Settings;
  errors: string[];
  ath?: AthInfo | null;
  /** Other Solana mints on the same ticker; only filled for a single-mint request. */
  vamps?: VampPool[];
}

interface MessageSender {
  url?: string;
  tab?: { url?: string };
}

interface ExtensionApi {
  runtime?: {
    onMessage?: {
      addListener(listener: (message: unknown, sender: MessageSender, sendResponse: (response: ScanResponse) => void) => boolean | void): void;
    };
  };
  storage?: { local?: { get(key: string): Promise<Record<string, unknown>> } };
}

function extensionApi(): ExtensionApi | undefined {
  return (globalThis as typeof globalThis & { chrome?: ExtensionApi }).chrome;
}

/** Only the content script running on the real Axiom Pulse page may request a scan. */
export function isAxiomPulseSender(sender: MessageSender): boolean {
  const href = sender.url ?? sender.tab?.url;
  if (!href) return false;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' && url.hostname === 'axiom.trade' && /^\/pulse(?:\/|$)/.test(url.pathname);
  } catch { return false; }
}

/**
 * Authorized page surfaces: the hosts our content scripts run on.
 *
 * This used to re-derive the route here too, allowing only Pulse or a recognised token
 * URL. That duplicated the content script's own knowledge of Axiom's routes, and it has
 * now failed the same way twice: Axiom renamed a token route, the content script resolved
 * the mint perfectly well, and this refused the scan, so the popup reported the coin as
 * having no data for a request that was never made. Route names belong to Axiom and cannot
 * be mirrored here.
 *
 * Host is the honest check. The manifest already restricts these content scripts to
 * axiom.trade and gmgn.ai, and nothing else can send this message: there is no
 * `externally_connectable`, so a web page cannot reach the service worker at all. Each
 * caller only asks about mints it has actually resolved, so a page that should not scan
 * simply never sends one.
 */
export function isScoutSender(sender: MessageSender): boolean {
  const href = sender.url ?? sender.tab?.url;
  if (!href) return false;
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:') return false;
    return url.hostname === 'axiom.trade' || url.hostname === 'gmgn.ai' || url.hostname === 'www.gmgn.ai';
  } catch { return false; }
}

/** Keep the page's input bounded; a ticker, shortened address or duplicate never becomes an identity. */
export function scanMints(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((value): value is string => typeof value === 'string' && mintPattern.test(value)))].slice(0, maxScanMints);
}

async function currentSettings(): Promise<Settings> {
  try {
    const values = await extensionApi()?.storage?.local?.get(settingsKey);
    return validSettings(values?.[settingsKey]);
  } catch { return defaults; }
}

// A single in-flight lookup per exact mint prevents two Pulse tabs from multiplying public API traffic.
const pending = new Map<string, Promise<Token>>();
function lookup(mint: string, now: number, followPool: boolean): Promise<Token> {
  // Keyed by both, because a token page is allowed to follow a pool address to the token
  // it holds while a list row is not, and the two must not share an in-flight promise.
  const key = `${mint}|${followPool ? 'pool' : 'mint'}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const request = fetchMint(mint, now, followPool).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

/** Independent public data only. Every failed lookup is omitted rather than reusing an old score. */
export async function assessVisibleMints(input: unknown, now = Date.now()): Promise<ScanResponse> {
  const settings = await currentSettings();
  const mints = scanMints(input);
  const errors: string[] = [];
  if (!Array.isArray(input)) errors.push('Invalid mint list.');
  else if (new Set(input.filter((value): value is string => typeof value === 'string' && mintPattern.test(value))).size > maxScanMints)
    errors.push(`Only the first ${maxScanMints} unique valid mints were scanned.`);
  const tokens: Token[] = [];
  // A single-mint request is a token page.
  const isTokenPage = mints.length === 1;

  for (let start = 0; start < mints.length; start += lookupConcurrency) {
    const batch = mints.slice(start, start + lookupConcurrency);
    const results = await Promise.allSettled(batch.map(mint => lookup(mint, now, isTokenPage)));
    results.forEach((result, index) => {
      const mint = batch[index];
      if (!mint) return;
      // A token page asks about one address, and Axiom's token route carries the *pool*.
      // The answer is then the token that pool holds, so its mint legitimately differs.
      // Everywhere else the mint must match exactly, so a crossed or stale answer can
      // never colour a row with another coin's readings.
      const token = result.status === 'fulfilled' ? result.value : null;
      const matched = token !== null && (token.mint === mint || isTokenPage);
      if (token !== null && matched && token.observedAt <= now + 60_000) tokens.push(token);
      else errors.push(`${mint.slice(0, 6)}...${mint.slice(-4)}: market lookup unavailable.`);
    });
  }

  // GoPlus leaves unsupported fields null. The shared scorer cannot award a top-candidate
  // status when creator or token-control evidence is missing.
  //
  // A single-mint request is a token page, which also wants the feed's per-token detail
  // (holder bands and the developer's own share). That runs *alongside* the security
  // lookup rather than after it: chaining the two put network round trips in series and
  // pushed a slow-but-working scan past the caller's timeout, which then reported the
  // scanner as unreachable.
  // Set the holder report going now, but do not wait for it here. Whether it is even
  // needed is not known until the providers answer, and awaiting it unconditionally put
  // its full round trip in front of every scan.
  if (isTokenPage) warmHolderAccounts(mints[0] ?? '', now);
  const [enriched, tokenInfo] = await Promise.all([
    enrichTokensWithGoPlus(tokens, now, mints),
    isTokenPage ? fetchTokenInfo(mints[0] ?? '', now).catch(() => null) : Promise.resolve(null)
  ]);
  const detailed = isTokenPage
    ? enriched.map(token => token.mint === mints[0] ? withTokenInfo(token, tokenInfo) : token)
    : enriched;
  // A token page with neither a holder list nor bands is the case that showed no
  // holder information at all; give the Solana-native report a chance to fill it in.
  const holdersFilled = isTokenPage
    ? await Promise.all(detailed.map(token => withFallbackReport(token, now)))
    : detailed;
  // A mint that no source could describe is not a scored coin. Scoring the stand-in
  // produced a 0/100 card for real tokens that were only not indexed yet, and that card
  // is indistinguishable from a genuinely bad coin. Report the miss so the page can say
  // "no data for this mint yet" instead of showing a verdict nobody earned.
  const identified = holdersFilled.filter(token => !isUnidentifiedToken(token));
  for (const token of holdersFilled) {
    if (isUnidentifiedToken(token)) errors.push(`${token.mint.slice(0, 6)}...${token.mint.slice(-4)}: no pool for this mint in the public feeds yet.`);
  }
  const assessments = assessTokens(identified, settings, now, new Set(mints))
    .filter(assessment => assessment.expiresAt >= now && assessment.token.observedAt <= now + 60_000);
  // Build Scout's own observation history (repeat names, observed highs) in the background.
  void recordObservations(identified, now).catch(() => { /* history is best-effort */ });
  // A single-mint request is a token page: look up its all-time high and any other
  // Solana pool trading under the same ticker, so the popup can answer "is this a vamp?".
  let ath: AthInfo | null = null;
  let vamps: VampPool[] = [];
  if (mints.length === 1) {
    const token = identified.find(candidate => candidate.mint === mints[0]) ?? null;
    const pool = token?.poolAddresses?.[0] ?? null;
    const [high, copies] = await Promise.all([
      fetchAth(pool, now).catch(() => null),
      token ? fetchVampPools(token.symbol, token.mint).catch(() => []) : Promise.resolve<VampPool[]>([])
    ]);
    ath = high;
    vamps = copies;
  }
  return { assessments, settings, errors, ath, vamps };
}

export function registerScanListener(api = extensionApi()): void {
  api?.runtime?.onMessage?.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== 'object' || (message as { type?: unknown }).type !== assessMintsMessage) return false;
    if (!isScoutSender(sender)) {
      sendResponse({ assessments: [], settings: defaults, errors: ['Scan request was not sent from an authorized page.'] });
      return false;
    }
    void assessVisibleMints((message as { mints?: unknown }).mints).then(sendResponse, () => {
      sendResponse({ assessments: [], settings: defaults, errors: ['Scan unavailable; no current assessments.'] });
    });
    return true;
  });
}

registerScanListener();
