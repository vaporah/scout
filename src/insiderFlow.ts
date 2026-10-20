import type { InsiderFlow, Token } from './types.js';

/** Keep a launch baseline long enough to catch the fast repeat pattern in the video. */
const launchWindowMs = 30 * 60_000;
const snapshots = new Map<string, {
  at: number;
  peakHoldingPct: number | null;
  peakLiquidityUsd: number | null;
}>();

const finite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function insiderSnapshot(token: Token): { pct: number | null; wallets: string[] } {
  const insiders = (token.holders ?? []).filter(holder => holder.insider === true && holder.type === 'wallet');
  if (!insiders.length) return { pct: null, wallets: [] };
  return {
    pct: insiders.reduce((sum, holder) => sum + holder.pct, 0),
    wallets: [...new Set(insiders.map(holder => holder.wallet))]
  };
}

/**
 * Add rolling exit evidence to exact-mint observations.
 *
 * The detector only calls a supply move an insider sale when the upstream holder
 * report explicitly labels those wallets as insiders. Liquidity is tracked separately:
 * a pool shrinking is evidence of a withdrawal, but not proof of who withdrew it.
 */
export function trackInsiderFlow(tokens: Token[], now = Date.now()): Token[] {
  for (const [mint, snapshot] of snapshots) {
    if (now - snapshot.at > launchWindowMs) snapshots.delete(mint);
  }

  return tokens.map(token => {
    const current = insiderSnapshot(token);
    const prior = snapshots.get(token.mint);
    const activePrior = prior && now - prior.at <= launchWindowMs ? prior : null;
    const peakHoldingPct = finite(current.pct)
      ? Math.max(current.pct, activePrior?.peakHoldingPct ?? current.pct)
      : activePrior?.peakHoldingPct ?? null;
    const peakLiquidityUsd = finite(token.liquidityUsd)
      ? Math.max(token.liquidityUsd, activePrior?.peakLiquidityUsd ?? token.liquidityUsd)
      : activePrior?.peakLiquidityUsd ?? null;
    const soldPct = finite(current.pct) && finite(peakHoldingPct)
      ? Math.max(0, peakHoldingPct - current.pct)
      : null;
    const liquidityDropPct = finite(token.liquidityUsd) && finite(peakLiquidityUsd) && peakLiquidityUsd > 0
      ? Math.max(0, (peakLiquidityUsd - token.liquidityUsd) / peakLiquidityUsd * 100)
      : null;

    let status: InsiderFlow['status'] = 'unknown';
    if ((soldPct ?? 0) >= 10 || (liquidityDropPct ?? 0) >= 30) status = 'exit';
    else if ((soldPct ?? 0) >= 3) status = 'selling';
    else if (current.pct !== null) status = 'watching';

    snapshots.set(token.mint, { at: now, peakHoldingPct, peakLiquidityUsd });
    const flow: InsiderFlow = {
      currentHoldingPct: current.pct,
      peakHoldingPct,
      soldPct,
      liquidityDropPct,
      linkedWallets: current.wallets,
      status,
      observedAt: now,
      source: current.pct !== null ? 'Solana token report insider labels + Scout observations' : 'Scout liquidity observations'
    };
    return { ...token, insiderFlow: flow };
  });
}

/** Test seam and a clean slate after extension updates. */
export function resetInsiderFlow(): void {
  snapshots.clear();
}
