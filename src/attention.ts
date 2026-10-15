import { hasCriticalFlag, hasEntryCaution, signalClass } from './ui.js';
import type { Analytics, Assessment, Settings, Token } from './types.js';

export interface AttentionSignal {
  id: 'volume' | 'broad';
  label: string;
}

/**
 * On-chain proxy for "getting volume / talked about". Real social chatter is
 * not available, so this uses 5m volume relative to liquidity and unique-buyer
 * breadth. It is an attention signal, not a buy recommendation.
 */
export function attentionSignals(token: Token, a: Analytics): AttentionSignal[] {
  const signals: AttentionSignal[] = [];
  const liq = token.liquidityUsd;
  if (liq !== null && liq > 0 && Number.isFinite(a.volume5m) && a.volume5m > 0) {
    const turnover = a.volume5m / liq;
    if (turnover >= 0.25) signals.push({ id: 'volume', label: `High 5m volume (~${Math.round(turnover * 100)}% of liquidity)` });
  }
  if (a.buyers5m !== null && a.buyers5m >= 8 && a.buys5m >= 15) signals.push({ id: 'broad', label: `${a.buyers5m} unique buyers in 5m` });
  return signals;
}

/**
 * How hard a coin is trading right now, as a multiple of its own pool.
 *
 * This is deliberately independent of the score. A brand-new pair has no creator
 * history, no holder breakdown and no token-control data, so most of its score is
 * made of things nobody can know yet — while the thing that actually matters, that
 * the coin is moving, is fully visible. A coin can run hard and still score poorly,
 * so movement is measured and shown on its own rather than through the score.
 */
export interface MovementVerdict {
  level: 'RUNNING' | 'ACTIVE' | 'QUIET';
  /** 5m volume as a multiple of the pool, or null when there is no baseline. */
  turnover: number | null;
  detail: string;
}

/** The pool turned its own liquidity over inside five minutes. */
export const runningTurnover = 1;
/** The same bar volumeVerdict already calls "high", kept in step with it. */
export const activeTurnover = 0.25;

/** 5m volume against liquidity, falling back to market cap, or null without a baseline. */
export function turnoverRatio(token: Token, a: Analytics): number | null {
  const volume = a.volume5m;
  if (!Number.isFinite(volume) || volume <= 0) return null;
  const base = token.liquidityUsd !== null && token.liquidityUsd > 0 ? token.liquidityUsd : token.marketCapUsd;
  if (base === null || base === undefined || base <= 0) return null;
  return volume / base;
}

const multipleLabel = (turnover: number): string => turnover >= 10 ? `${Math.round(turnover)}\u00d7` : `${turnover.toFixed(1)}\u00d7`;

export function movementVerdict(token: Token, a: Analytics): MovementVerdict {
  if (a.volume5m === 0) return { level: 'QUIET', turnover: null, detail: 'No 5m volume at all' };
  const turnover = turnoverRatio(token, a);
  if (turnover === null) return { level: 'QUIET', turnover: null, detail: 'No pool size to measure volume against' };
  const detail = `${usdShort(a.volume5m)} of 5m volume, ${multipleLabel(turnover)} the pool`;
  if (turnover >= runningTurnover) return { level: 'RUNNING', turnover, detail };
  if (turnover >= activeTurnover) return { level: 'ACTIVE', turnover, detail };
  return { level: 'QUIET', turnover, detail };
}

/**
 * A "hot" coin: Scout's strongest verdict, a crowd buying rather than one wallet,
 * and genuinely heavy volume behind it. This is what earns the bright animated
 * row highlight, so every part of the bar sits deliberately above the plain
 * attention signals — more unique wallets, more buys, buys clearly outweighing
 * sells, and 5m volume worth at least a quarter of the pool.
 *
 * It is still a research cue: it says the available data currently looks as good
 * as Scout can tell, which is not the same as the coin being safe.
 */
/**
 * The coin is clearly moving, but its verdict has nothing better to say than grey.
 *
 * Grey normally reads as "Scout has no opinion", which is misleading when the coin is
 * visibly trading. Shared by the row colour and the badge so the two can never
 * disagree about whether a coin is worth looking at.
 */
export function runningWithoutVerdict(a: Assessment, settings: Settings): boolean {
  if (signalClass(a, settings) !== 'signal-gray') return false;
  return movementVerdict(a.token, a.analytics).level === 'RUNNING';
}

export interface HotCoin {
  label: string;
  detail: string;
}

/** Minimum unique buying wallets in the last 5 minutes. */
const hotBuyers5m = 12;
/** Minimum buy transactions in the last 5 minutes. */
const hotBuys5m = 20;
/** Buys must beat sells by this factor, so a balanced book is never "hot". */
const hotBuyRatio = 1.5;

export function hotCoin(a: Assessment, settings: Settings): HotCoin | null {
  // "A good one" has to mean a verdict the live feed can actually produce. A brand
  // new pair can never be TOP CANDIDATE — that needs buyer-growth, net-pressure and
  // volume-acceleration baselines the pool feed does not carry — so the top two
  // tiers both qualify: TOP CANDIDATE, or WATCH (Scout's "worth watching" tier,
  // which is what a genuinely strong new pair reaches). Anything Scout is actively
  // warning about, and anything WAIT/UNKNOWN, is out.
  if (a.status !== 'TOP CANDIDATE' && a.status !== 'WATCH') return null;
  // Shared with signalClass, so the hot state can never disagree with the row colour.
  if (hasCriticalFlag(a)) return null;
  if (hasEntryCaution(a, settings)) return null;
  const { buyers5m, buys5m, sells5m } = a.analytics;
  // Crowd participation is the point of the brightest highlight, so an unpublished
  // buyer count is a reason not to light it up rather than something to assume.
  if (buyers5m === null || buyers5m < hotBuyers5m || buys5m < hotBuys5m) return null;
  if (buys5m < sells5m * hotBuyRatio) return null;
  // Heavy volume is the whole point of the brightest highlight, and it has to be
  // verifiable: volumeVerdict reads volume against liquidity (or market cap) and
  // returns UNKNOWN when there is no baseline at all, which is not good enough.
  const volume = volumeVerdict(a.token, a.analytics);
  if (volume.level !== 'HIGH') return null;
  return { label: 'HOT', detail: `${buyers5m} unique buyers, ${buys5m} buys \u00b7 ${volume.detail}` };
}

export interface VolumeVerdict {
  level: 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN';
  tone: 'green' | 'amber' | 'red' | 'neutral';
  detail: string;
}

const usdShort = (value: number): string => value >= 1000 ? `$${(value / 1000).toFixed(1)}K` : `$${value.toFixed(value < 1 ? 4 : 0)}`;

/** Plain-language volume read for the popup: 5m volume relative to liquidity (or market cap). */
export function volumeVerdict(token: Token, a: Analytics): VolumeVerdict {
  const volume = a.volume5m;
  if (!Number.isFinite(volume) || volume <= 0) return { level: 'UNKNOWN', tone: 'neutral', detail: 'No recent 5m volume data' };
  const hasLiquidity = token.liquidityUsd !== null && token.liquidityUsd > 0;
  const base = hasLiquidity ? token.liquidityUsd : token.marketCapUsd;
  if (base === null || base === undefined || base <= 0) {
    return { level: 'UNKNOWN', tone: 'neutral', detail: `${usdShort(volume)} 5m volume (no liquidity baseline)` };
  }
  const ratio = volume / base;
  const detail = `${usdShort(volume)} 5m volume \u00b7 ${Math.round(ratio * 100)}% of ${hasLiquidity ? 'liquidity' : 'market cap'}`;
  if (ratio >= 0.25) return { level: 'HIGH', tone: 'green', detail };
  if (ratio >= 0.05) return { level: 'MODERATE', tone: 'amber', detail };
  return { level: 'LOW', tone: 'red', detail };
}
