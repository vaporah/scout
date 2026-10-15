import type { Token } from './types.js';

export interface SolPoolReading {
  short: string;
  detail: string;
  exact: boolean;
}

export interface SolFlowReading {
  short: string;
  detail: string;
  exact: boolean;
}

const isSolPair = (symbol: string | null | undefined): boolean => {
  const quote = symbol?.trim().toUpperCase();
  return quote === 'SOL' || quote === 'WSOL';
};

const formatSol = (value: number): string =>
  `${value.toLocaleString('en-US', { maximumFractionDigits: 3 })} SOL`;

/**
 * Describe the SOL side of the selected pool without estimating it from USD liquidity.
 * DEX Screener publishes an exact quote reserve for many migrated SOL pools. Fresh
 * bonding-curve tokens often have no LP reserve yet, and other sources may omit the
 * quote reserve entirely; those cases stay explicit instead of disappearing.
 */
export function solPoolReading(token: Token): SolPoolReading {
  if (token.liquiditySol !== null && token.liquiditySol !== undefined && Number.isFinite(token.liquiditySol) && token.liquiditySol >= 0) {
    const value = formatSol(token.liquiditySol);
    return { short: value, detail: value, exact: true };
  }

  if (token.quoteSymbol && !isSolPair(token.quoteSymbol)) {
    return { short: `No (${token.quoteSymbol})`, detail: `Not a SOL pool; quoted in ${token.quoteSymbol}`, exact: false };
  }

  if (token.dexName?.toLowerCase() === 'pumpfun' && token.liquidityUsd === null) {
    return { short: 'Pre-LP', detail: 'Pre-migration bonding curve; no liquidity pool yet', exact: false };
  }

  return { short: 'Unavailable', detail: 'Exact SOL reserve not published by the pool source', exact: false };
}

const signedSol = (value: number): string => {
  const formatted = Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 3 });
  return `${value > 0 ? '+' : value < 0 ? '-' : ''}${formatted} SOL`;
};

/** Five-minute net SOL buy flow for the exact pool, not fees or an estimate. */
export function solFlowReading(token: Token): SolFlowReading {
  const flow = token.solFlow5m;
  if (!flow || !Number.isFinite(flow.netSol)) {
    return { short: 'Unavailable', detail: 'Exact five-minute SOL flow not published yet', exact: false };
  }
  const parts = [
    `${signedSol(flow.netSol)} net`,
    flow.buySol !== null && Number.isFinite(flow.buySol) ? `${flow.buySol.toLocaleString('en-US', { maximumFractionDigits: 3 })} in` : null,
    flow.sellSol !== null && Number.isFinite(flow.sellSol) ? `${flow.sellSol.toLocaleString('en-US', { maximumFractionDigits: 3 })} out` : null
  ].filter(Boolean);
  return { short: signedSol(flow.netSol), detail: parts.join(' · '), exact: true };
}
