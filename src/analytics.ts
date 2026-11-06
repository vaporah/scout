import type { Analytics, ChartIntegrity, Token } from './types.js';
export function chartIntegrity(token: Token, volume5m: number, tradeCount: number, walletConcentration: number): ChartIntegrity {
  const flags: string[] = [];
  if (volume5m <= 0 && tradeCount === 0) return { status: 'unknown', score: 0, flags: ['No chart activity to validate'] };
  const liquidity = token.liquidityUsd;
  if (liquidity !== null && volume5m > liquidity * 20 && tradeCount < 8) flags.push('Reported volume is extreme for the number of observed trades');
  if (liquidity !== null && token.priceChange5mPct !== null && token.priceChange5mPct >= 30 && volume5m < Math.max(1000, liquidity * .05)) flags.push('Price spike is not supported by meaningful pool turnover');
  if (walletConcentration >= .65 && tradeCount >= 6) flags.push('One wallet supplies most observed chart volume');
  if (token.liquidityChangePct !== null && token.liquidityChangePct <= -25 && token.priceChange5mPct !== null && token.priceChange5mPct >= 10) flags.push('Price is rising while liquidity is leaving the pool');
  const status = flags.length >= 2 ? 'suspicious' : flags.length === 1 ? 'degraded' : 'clean';
  return { status, score: Math.max(0, 1 - flags.length * .35), flags };
}
export function analyze(token: Token, now: number): Analytics {
  if (token.marketSnapshot) {
    const s = token.marketSnapshot;
    return {
      volume30s: null, volume1m: null, volume5m: s.volume5m, volume15m: s.volume15m,
      buys5m: s.buys5m, sells5m: s.sells5m, buyVolume5m: null, sellVolume5m: null,
      buyers5m: s.buyers5m, sellers5m: s.sellers5m,
      buyerGrowth: null, volumeAcceleration: null, repeatBuyers: 0, netPressure: null,
      suspiciousConcentration: false,
      chartIntegrity: chartIntegrity(token, s.volume5m, 0, 0)
    };
  }
  const recent = (ms: number) => token.trades.filter(t => t.at <= now && t.at >= now - ms);
  const m5 = recent(300_000), m1 = recent(60_000), previous = token.trades.filter(t => t.at < now - 60_000 && t.at >= now - 120_000);
  const sum = (trades: typeof m5) => trades.reduce((a, t) => a + t.usd, 0);
  const buyers = m5.filter(t => t.side === 'buy'), sellers = m5.filter(t => t.side === 'sell');
  const buyVol = sum(buyers), sellVol = sum(sellers), total = buyVol + sellVol;
  const walletVolume = new Map<string, number>();
  for (const t of m5) walletVolume.set(t.wallet, (walletVolume.get(t.wallet) ?? 0) + t.usd);
  const maxWallet = Math.max(0, ...walletVolume.values());
  const buyerCounts = new Map<string, number>();
  for (const t of buyers) buyerCounts.set(t.wallet, (buyerCounts.get(t.wallet) ?? 0) + 1);
  const currentBuyerCount = new Set(m1.filter(t => t.side === 'buy').map(t => t.wallet)).size;
  const previousBuyerCount = new Set(previous.filter(t => t.side === 'buy').map(t => t.wallet)).size;
  const previousVolume = sum(previous);
  const chart = chartIntegrity(token, total, m5.length, total ? maxWallet / total : 0);
  return {
    volume30s: sum(recent(30_000)), volume1m: sum(m1), volume5m: total, volume15m: sum(recent(900_000)),
    buys5m: buyers.length, sells5m: sellers.length, buyVolume5m: buyVol, sellVolume5m: sellVol,
    buyers5m: buyerCounts.size, sellers5m: new Set(sellers.map(t => t.wallet)).size,
    buyerGrowth: previousBuyerCount ? (currentBuyerCount - previousBuyerCount) / previousBuyerCount : null,
    volumeAcceleration: previousVolume ? sum(m1) / previousVolume : null,
    repeatBuyers: [...buyerCounts.values()].filter(n => n > 1).length,
    netPressure: total ? (buyVol - sellVol) / total : null,
    suspiciousConcentration: total > 0 && (maxWallet / total > 0.45 || (m5.length >= 8 && walletVolume.size <= 2)), chartIntegrity: chart
  };
}
export function holderConcentration(token: Token, top = 10): number | null {
  if (!token.holders) return null;
  return token.holders.filter(h => h.type === 'wallet').sort((a, b) => b.pct - a.pct).slice(0, top).reduce((sum, h) => sum + h.pct, 0);
}
// Constant-product approximation; a pool's true curve and fees may differ.
export function estimateSlippagePct(liquidityUsd: number | null, tradeUsd: number): number | null {
  if (liquidityUsd === null || liquidityUsd <= 0) return null;
  const reserve = liquidityUsd / 2;
  return 100 * tradeUsd / (reserve + tradeUsd);
}
