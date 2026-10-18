import type { Token, TokenProvider, Trade, Stage } from './types.js';

type Seed = { name: string; symbol: string; stage: Stage; ageMin: number; cap: number; liq: number; change: number; pressure: number; grow: boolean; dev: 'clean' | 'farmer' | 'unknown'; holders: number; mint: string };
const seeds: Seed[] = [
  { name: 'Orbit Finch', symbol: 'FINCH', stage: 'new', ageMin: 4, cap: 38400, liq: 19600, change: 11, pressure: .68, grow: true, dev: 'clean', holders: 23, mint: 'DemoFinch1111111111111111111111111111111111' },
  { name: 'Moss Arcade', symbol: 'MOSS', stage: 'new', ageMin: 11, cap: 26300, liq: 7800, change: 21, pressure: .83, grow: true, dev: 'unknown', holders: 62, mint: 'DemoMoss11111111111111111111111111111111111' },
  { name: 'Soda Pilot', symbol: 'SODA', stage: 'new', ageMin: 2, cap: 12700, liq: 11900, change: -8, pressure: .41, grow: false, dev: 'farmer', holders: 69, mint: 'DemoSoda11111111111111111111111111111111111' },
  { name: 'Night Glider', symbol: 'GLIDE', stage: 'new', ageMin: 19, cap: 61400, liq: 27400, change: 7, pressure: .58, grow: true, dev: 'clean', holders: 37, mint: 'DemoGlide1111111111111111111111111111111111' },
  { name: 'Blue Comet', symbol: 'COMET', stage: 'bonding', ageMin: 47, cap: 92400, liq: 32500, change: 13, pressure: .74, grow: true, dev: 'clean', holders: 28, mint: 'DemoComet1111111111111111111111111111111111' },
  { name: 'Velvet Circuit', symbol: 'VELVET', stage: 'bonding', ageMin: 83, cap: 145000, liq: 22000, change: 18, pressure: .55, grow: false, dev: 'unknown', holders: 41, mint: 'DemoVelvet111111111111111111111111111111111' },
  { name: 'Echo Garden', symbol: 'ECHO', stage: 'bonding', ageMin: 32, cap: 70900, liq: 18000, change: -3, pressure: .48, grow: false, dev: 'farmer', holders: 53, mint: 'DemoEcho11111111111111111111111111111111111' },
  { name: 'Lunar Fern', symbol: 'FERN', stage: 'migrated', ageMin: 154, cap: 281000, liq: 81500, change: 4, pressure: .65, grow: true, dev: 'clean', holders: 26, mint: 'DemoFern11111111111111111111111111111111111' },
  { name: 'Paper Current', symbol: 'PAPER', stage: 'migrated', ageMin: 218, cap: 194000, liq: 39800, change: -13, pressure: .38, grow: false, dev: 'unknown', holders: 44, mint: 'DemoPaper1111111111111111111111111111111111' },
  { name: 'Copper Goose', symbol: 'GOOSE', stage: 'migrated', ageMin: 391, cap: 531000, liq: 112000, change: 10, pressure: .71, grow: true, dev: 'clean', holders: 35, mint: 'DemoGoose1111111111111111111111111111111111' }
];

function trades(seed: Seed, now: number): Trade[] {
  const result: Trade[] = [];
  const count = seed.grow ? 42 : 26;
  for (let i = 0; i < count; i++) {
    const secondsAgo = seed.grow ? (i < 27 ? i * 2.1 : 65 + (i - 27) * 3.2) : i * 4.4;
    const side = ((i * 7 + seed.symbol.length) % 100) / 100 < seed.pressure ? 'buy' : 'sell';
    const wallet = seed.dev === 'farmer' ? `wallet-${i % 2}` : `wallet-${i % (seed.grow ? 29 : 13)}`;
    result.push({ at: now - secondsAgo * 1000, side, usd: 60 + (i % 7) * 41, wallet, priceUsd: seed.cap / 1e9 });
  }
  return result;
}
function token(seed: Seed, now: number): Token {
  const known = seed.dev !== 'unknown';
  return {
    mint: seed.mint, name: seed.name, symbol: seed.symbol, stage: seed.stage,
    chain: 'solana', launchedAt: now - seed.ageMin * 60_000, observedAt: now, priceUsd: seed.cap / 1e9,
    marketCapUsd: seed.cap, fdvUsd: seed.cap * 1.08, liquidityUsd: seed.liq,
    liquidityChangePct: seed.dev === 'farmer' ? -12 : 5, priceChange5mPct: seed.change, imageUrl: null,
    trades: trades(seed, now),
    holders: [{ wallet: 'pool', pct: 19, type: 'pool' }, { wallet: 'burn', pct: 7, type: 'burn' }, ...Array.from({ length: 20 }, (_, i) => ({ wallet: `holder-${i}`, pct: seed.holders / 10 / (1 + i * .12), type: 'wallet' as const }))],
    developer: {
      creator: known ? `DemoCreator${seed.symbol}11111111111111111111111111` : null,
      priorLaunches: seed.dev === 'farmer' ? 37 : known ? 2 : null,
      rapidFailures: seed.dev === 'farmer' ? 26 : known ? 0 : null,
      linkedSales: seed.dev === 'farmer' ? 4 : known ? 0 : null,
      source: known ? 'demo' : 'unknown',
      note: seed.dev === 'farmer' ? 'Simulated repeat-launch / rapid-failure pattern. Not a claim about a real wallet.' : known ? 'Simulated launch-history record.' : 'Creator and launch history not available.'
    },
    mintAuthority: known ? false : null, freezeAuthority: known ? false : null, transferRestriction: known ? false : null,
    migrationProgressPct: seed.stage === 'bonding' ? 82 + seed.symbol.length % 15 : null,
    provider: 'SIMULATED DEMO'
  };
}
export const demoProvider: TokenProvider = { id: 'demo', label: 'Simulated demo', async fetch(now) { return seeds.map(seed => token(seed, now)); } };
