import type { LaunchCheckpoint, Token } from './types.js';

const checkpointMs = 60_000;
const retentionMs = 6 * 60 * 60_000;
const baselines = new Map<string, { at: number; priceUsd: number | null; marketCapUsd: number | null }>();

const valid = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const change = (start: number | null, current: number | null): number | null =>
  valid(start) && valid(current) ? (current - start) / start * 100 : null;

/** Attach a reproducible checkpoint measured from Scout's own first observation. */
export function trackLaunchCheckpoints(tokens: Token[], now = Date.now()): Token[] {
  for (const [mint, baseline] of baselines) if (now - baseline.at > retentionMs) baselines.delete(mint);
  return tokens.map(token => {
    let baseline = baselines.get(token.mint);
    if (!baseline) {
      baseline = { at: now, priceUsd: token.priceUsd, marketCapUsd: token.marketCapUsd };
      baselines.set(token.mint, baseline);
    }
    const dueAt = baseline.at + checkpointMs;
    const ready = now >= dueAt;
    const checkpoint: LaunchCheckpoint = {
      firstObservedAt: baseline.at,
      dueAt,
      capturedAt: ready ? now : null,
      startPriceUsd: baseline.priceUsd,
      priceUsd: ready ? token.priceUsd : null,
      priceChangePct: ready ? change(baseline.priceUsd, token.priceUsd) : null,
      startMarketCapUsd: baseline.marketCapUsd,
      marketCapUsd: ready ? token.marketCapUsd : null,
      marketCapChangePct: ready ? change(baseline.marketCapUsd, token.marketCapUsd) : null
    };
    return { ...token, launchCheckpoint: checkpoint };
  });
}

export function resetLaunchCheckpoints(): void {
  baselines.clear();
}
