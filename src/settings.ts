import type { Settings } from './types.js';
export const defaults: Settings = {
  refreshSeconds: 15, minLiquidityUsd: 15000, maxSlippagePct: 3, tradeSizeUsd: 200,
  minScore: 72, maxAgeHours: 48, notifications: false,
  weights: { momentum: 25, liquidity: 20, developer: 20, price: 15, holders: 10, security: 10 }
};
export function validSettings(input: unknown): Settings {
  const obj = input && typeof input === 'object' ? input as Partial<Settings> : {};
  const num = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  return {
    ...defaults,
    refreshSeconds: num(obj.refreshSeconds, defaults.refreshSeconds, 10, 300),
    minLiquidityUsd: num(obj.minLiquidityUsd, defaults.minLiquidityUsd, 0, 1_000_000),
    maxSlippagePct: num(obj.maxSlippagePct, defaults.maxSlippagePct, 0.1, 20),
    tradeSizeUsd: num(obj.tradeSizeUsd, defaults.tradeSizeUsd, 1, 100_000),
    minScore: num(obj.minScore, defaults.minScore, 0, 100),
    maxAgeHours: num(obj.maxAgeHours, defaults.maxAgeHours, 1, 720),
    notifications: obj.notifications === true,
    weights: defaults.weights
  };
}
