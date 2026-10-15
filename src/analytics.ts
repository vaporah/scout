import type { Analytics, Token } from './types.js';
export function analyze(token: Token, now: number): Analytics {
  if (token.marketSnapshot) {
    const s = token.marketSnapshot;
    return {
      volume30s: null, volume1m: null, volume5m: s.volume5m, volume15m: s.volume15m,
      buys5m: s.buys5m, sells5m: s.sells5m, buyVolume5m: null, sellVolume5m: null,
      buyers5m: s.buyers5m, sellers5m: s.sellers5m,
      buyerGrowth: null, volumeAcceleration: null, repeatBuyers: 0, netPressure: null,
      suspiciousConcentration: false
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
  return {
    volume30s: sum(recent(30_000)), volume1m: sum(m1), volume5m: total, volume15m: sum(recent(900_000)),
    buys5m: buyers.length, sells5m: sellers.length, buyVolume5m: buyVol, sellVolume5m: sellVol,
    buyers5m: buyerCounts.size, sellers5m: new Set(sellers.map(t => t.wallet)).size,
    buyerGrowth: previousBuyerCount ? (currentBuyerCount - previousBuyerCount) / previousBuyerCount : null,
    volumeAcceleration: previousVolume ? sum(m1) / previousVolume : null,
    repeatBuyers: [...buyerCounts.values()].filter(n => n > 1).length,
    netPressure: total ? (buyVol - sellVol) / total : null,
    suspiciousConcentration: total > 0 && (maxWallet / total > 0.45 || (m5.length >= 8 && walletVolume.size <= 2))
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
