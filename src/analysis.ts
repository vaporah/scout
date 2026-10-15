import { assess } from './scoring.js';
import type { Assessment, Settings, Token } from './types.js';

const solanaMint = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** One mint-keyed assessment path for every Scout surface. */
export function assessTokens(tokens: Token[], settings: Settings, now: number, pinnedMints: ReadonlySet<string> = new Set()): Assessment[] {
  const byMint = new Map<string, Token>();
  for (const token of tokens) {
    if (token.provider !== 'SIMULATED DEMO' && !solanaMint.test(token.mint)) continue;
    if (!Number.isFinite(token.observedAt) || token.observedAt > now + 60_000) continue;
    if (token.chain !== 'solana') continue;
    if (!pinnedMints.has(token.mint) && token.launchedAt !== null && now - token.launchedAt > settings.maxAgeHours * 3_600_000) continue;
    const previous = byMint.get(token.mint);
    if (!previous || token.observedAt > previous.observedAt) byMint.set(token.mint, token);
  }
  return [...byMint.values()].map(token => assess(token, settings, now)).sort((a, b) => b.score - a.score);
}
