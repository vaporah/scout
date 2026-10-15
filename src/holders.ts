import type { HolderShare, Token } from './types.js';

/**
 * Holder breakdown for a coin: how many wallets hold it, how concentrated the top
 * ten are, and what the developer behind it actually holds.
 *
 * Everything here is derived from the holder list the data provider returned. When
 * a provider gives no holder breakdown — which is the norm for a token minted
 * minutes ago — this returns null rather than a set of zeroes, so the popup can say
 * "not published yet" instead of implying the coin has no holders.
 */

export interface CreatorHolding {
  wallet: string;
  /** Share of supply in percent, or null when it can only be bounded. */
  pct: number | null;
  /** 1-based position in the top holders, or null when outside the reported list. */
  rank: number | null;
  locked: boolean;
  /**
   * Where the share came from, so the popup can word it honestly:
   * `ranked` — read off the wallet list, `feed` — stated outright by the feed,
   * `below-list` — the wallet is known but did not appear, so all we know is an upper bound.
   */
  basis: 'ranked' | 'feed' | 'below-list';
}

export interface HolderBand {
  label: string;
  pct: number;
}

export interface HolderReading {
  /** Number of distinct holders, when the provider reports a count. */
  count: number | null;
  /** How many holders the breakdown actually lists. */
  listed: number;
  /** Combined share of the listed top holders, in percent, or null without a list. */
  topPct: number | null;
  /** Share held by the ten largest wallets, from the band data when there is no list. */
  top10Pct: number | null;
  /** Distribution by band, when the provider publishes bands instead of wallets. */
  bands: HolderBand[];
  /** Largest wallet in the list. */
  largest: HolderShare | null;
  /** Every listed holder, largest first. */
  top: HolderShare[];
  /** What the coin's creator holds, when the creator wallet is known and findable. */
  creator: CreatorHolding | null;
  /** Whether Scout even knows the creator wallet for this token. */
  creatorKnown: boolean;
  /** A flat warning when one wallet dominates the supply. */
  note: string | null;
}

/** Share of supply held by one wallet that is worth calling out. */
const dominantWalletPct = 20;

/** Largest first, so the popup always reads top-down. */
const byHolding = (a: HolderShare, b: HolderShare): number => b.pct - a.pct;

/**
 * Everything Scout can say about who holds a coin. It draws on two sources that
 * cover different tokens: the security provider's ranked wallet list, and the feed's
 * distribution bands plus the developer's own share. Either alone is enough to
 * return a reading; with neither, this returns null so the popup can say so.
 */
export function holderReadings(token: Token): HolderReading | null {
  const raw = token.holders ?? [];
  const top = [...raw].sort(byHolding);
  const topPct = top.length ? top.reduce((sum, holder) => sum + holder.pct, 0) : null;
  const largest = top[0] ?? null;

  const bands: HolderBand[] = [];
  const addBand = (label: string, pct: number | null | undefined): void => {
    if (typeof pct === 'number' && Number.isFinite(pct)) bands.push({ label, pct });
  };
  addBand('Top 10 wallets', token.holderBands?.top10);
  addBand('Wallets 11-20', token.holderBands?.next10);
  addBand('Wallets 21-40', token.holderBands?.mid);
  addBand('Everyone else', token.holderBands?.rest);

  const count = token.holderCount ?? null;
  // Say nothing at all only when there is genuinely nothing: no wallet list, no
  // bands, no count and no developer share.
  const hasAnything = top.length > 0 || bands.length > 0 || count !== null || typeof token.developerHoldingPct === 'number';
  if (!hasAnything) return null;

  const creatorWallet = token.developer.creator;
  const creatorKnown = typeof creatorWallet === 'string' && creatorWallet.length > 0;
  let creator: CreatorHolding | null = null;
  if (creatorKnown) {
    const index = top.findIndex(holder => holder.wallet === creatorWallet);
    const stated = typeof token.developerHoldingPct === 'number' && Number.isFinite(token.developerHoldingPct)
      ? token.developerHoldingPct
      : null;
    if (index >= 0) {
      // Read straight off the wallet list: the most direct evidence there is.
      const holder = top[index];
      if (holder) creator = { wallet: holder.wallet, pct: holder.pct, rank: index + 1, locked: holder.locked === true, basis: 'ranked' };
    } else if (stated !== null) {
      // The feed states the developer's share outright, so use it rather than
      // inferring anything from their absence in a list that may not be published.
      creator = { wallet: creatorWallet, pct: stated, rank: null, locked: false, basis: 'feed' };
    } else if (top.length) {
      // Known wallet, no stated share, and absent from the list: it is an upper bound.
      creator = { wallet: creatorWallet, pct: null, rank: null, locked: false, basis: 'below-list' };
    } else {
      creator = { wallet: creatorWallet, pct: null, rank: null, locked: false, basis: 'below-list' };
    }
  }

  // A vault is not a wallet: saying "one wallet holds 99%" on a token minutes old
  // would flag the bonding curve as a whale, which is a false alarm rather than a
  // finding. The share is still reported, but the claim about who holds it is not made.
  const note = largest === null ? null
    : largest.type === 'pool'
      ? `The largest account holds ${largest.pct.toFixed(1)}% of the supply. On a token this new that is usually the pool or bonding curve rather than a person.`
      : largest.pct >= dominantWalletPct
        ? `One wallet holds ${largest.pct.toFixed(1)}% of the supply.`
        : null;

  return {
    count,
    listed: top.length,
    topPct,
    top10Pct: token.holderBands?.top10 ?? token.top10HoldPct ?? topPct,
    bands,
    largest,
    top,
    creator,
    creatorKnown,
    note
  };
}

/** Short, readable form of a Solana address: `9WzDXw…tAWWM`. */
export function shortWallet(wallet: string): string {
  return wallet.length > 12 ? `${wallet.slice(0, 6)}\u2026${wallet.slice(-5)}` : wallet;
}
