import type { Assessment } from './types.js';

export type CoinReadTone = 'green' | 'orange' | 'red' | 'neutral';

export interface CoinRead {
  tone: CoinReadTone;
  headline: string;
  demand: string;
  execution: string;
  evidence: string;
}

const money = (value: number): string => `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

/**
 * Turn the assessment into a cautious, plain-language trading read.
 *
 * This is intentionally derived only from evidence already tied to the exact mint.
 * It does not predict price or turn missing fields into positive signals; instead it
 * tells the reader what is moving, whether the pool can support an entry, and how
 * much of the safety picture Scout can actually verify.
 */
export function coinRead(a: Assessment): CoinRead {
  const token = a.token;
  const market = a.analytics;
  const hasActivity = Boolean(token.marketSnapshot) || token.trades.length > 0;
  const turnover = token.liquidityUsd !== null && token.liquidityUsd > 0 && market.volume5m > 0
    ? market.volume5m / token.liquidityUsd
    : null;
  const buysLead = hasActivity && market.buys5m >= 3 && market.buys5m > market.sells5m * 1.35;
  const sellsLead = hasActivity && market.sells5m >= 3 && market.sells5m > market.buys5m * 1.35;
  const fast = turnover !== null && turnover >= 1;
  const falling = token.priceChange5mPct !== null && token.priceChange5mPct <= -10;

  const demand = !hasActivity
    ? 'Demand is not published yet.'
    : sellsLead || falling
      ? `Demand is weakening: ${market.buys5m} buys vs ${market.sells5m} sells${falling ? `, price ${token.priceChange5mPct!.toFixed(1)}% in 5m` : ''}.`
      : buysLead && fast
        ? `Demand is strong: buys lead ${market.buys5m} to ${market.sells5m}, with 5m volume at ${turnover!.toFixed(1)}× pool liquidity.`
        : buysLead
          ? `Demand is positive: buys lead ${market.buys5m} to ${market.sells5m}, but turnover is not yet strong.`
          : fast
            ? `Trading is fast at ${turnover!.toFixed(1)}× pool liquidity in 5m, without a clear buy-count lead.`
            : `Demand is mixed: ${market.buys5m} buys vs ${market.sells5m} sells in 5m.`;

  const execution = token.liquidityUsd === null
    ? 'Execution quality is unknown because pool liquidity is missing.'
    : a.slippagePct === null
      ? `${money(token.liquidityUsd)} liquidity is published; estimated entry impact is unavailable.`
      : `${money(token.liquidityUsd)} liquidity with about ${a.slippagePct.toFixed(1)}% estimated impact for the configured trade size.`;

  const missingSafety = token.mintAuthority === null || token.freezeAuthority === null
    || token.transferRestriction === null || token.developer.creator === null;
  const evidence = `${a.dataCompletenessPct}% evidence coverage (${a.confidence} confidence)${missingSafety ? '; creator or token-control checks are still incomplete.' : '; creator and token-control checks are present.'}`;

  if (a.critical.length || a.status === 'DISQUALIFIED') {
    return { tone: 'red', headline: 'Critical risk outweighs the current market activity.', demand, execution, evidence };
  }
  if (a.status === 'HIGH RISK' || sellsLead || falling || (a.slippagePct !== null && a.slippagePct > 5)) {
    return { tone: 'orange', headline: 'The setup is fragile; risk or selling pressure needs attention.', demand, execution, evidence };
  }
  if (buysLead && fast && a.confidence !== 'low' && !missingSafety) {
    return { tone: 'green', headline: 'Demand, execution, and verified checks currently align.', demand, execution, evidence };
  }
  if (buysLead || fast) {
    return { tone: 'orange', headline: 'Market activity is promising, but the setup is not fully confirmed.', demand, execution, evidence };
  }
  return { tone: 'neutral', headline: 'There is not enough aligned evidence for a strong read yet.', demand, execution, evidence };
}
