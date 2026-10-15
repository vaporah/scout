export type Stage = 'new' | 'bonding' | 'migrated' | 'unknown';
export type Status = 'TOP CANDIDATE' | 'WATCH' | 'WAIT FOR CONFIRMATION' | 'HIGH RISK' | 'DISQUALIFIED' | 'UNKNOWN / INCOMPLETE';
export type Confidence = 'low' | 'medium' | 'high';
export interface Trade { at: number; side: 'buy' | 'sell'; usd: number; wallet: string; priceUsd: number }
/**
 * One entry in a holder breakdown. `pct` is a share of total supply, and `type`
 * stays conservative: a provider only labels an address as a pool or a burn when
 * it actually says so, otherwise the address is treated as an ordinary wallet.
 */
export interface HolderShare {
  wallet: string;
  pct: number;
  type: 'wallet' | 'pool' | 'burn';
  /** Provider label for the address, when it gives one. */
  tag?: string | null;
  /** Provider reports the balance as locked or vested. */
  locked?: boolean;
}
/**
 * Who is doing the holding, rather than how much is held.
 *
 * A memecoin's holder count says little on its own: 1,200 wallets that are six minutes old
 * and were funded to buy the launch is a different trade from 1,200 that arrived on their
 * own. These are the shares the trading UIs show for exactly that reason.
 *
 * Every field is a share of supply in percent, except `devLaunches`, which counts the
 * tokens the deployer has made before this one. All are nullable: a missing figure means
 * the feed did not publish it, and must never be read as a clean zero.
 */
export interface HolderQuality {
  /** Tokens the deployer created before this one, when the feed counts them. */
  devLaunches: number | null;
  /** Share bought in the same block as the launch, i.e. bundled entries. */
  bundlerPct: number | null;
  /** Share held by the wallets the feed flags as launch snipers. */
  sniperPct: number | null;
  /** Share held by wallets flagged as bots or degen traders. */
  botDegenPct: number | null;
  /** Share held by wallets created in the last day. */
  freshWalletPct: number | null;
}

export interface DeveloperEvidence {
  creator: string | null;
  priorLaunches: number | null;
  rapidFailures: number | null;
  linkedSales: number | null;
  source: 'demo' | 'verified' | 'unknown';
  note: string;
  farmerEvidence?: {
    linkedWallets: string[];
    fundingTransactions: string[];
    distributionTransactions: string[];
    coordinatedSaleTransactions: string[];
  };
}
export interface Token {
  mint: string; chain: 'solana'; name: string; symbol: string; stage: Stage; launchedAt: number | null; observedAt: number;
  poolAddresses?: string[];
  priceUsd: number | null; marketCapUsd: number | null; fdvUsd: number | null; liquidityUsd: number | null;
  liquidityChangePct: number | null; priceChange5mPct: number | null; imageUrl: string | null;
  trades: Trade[]; holders: HolderShare[] | null;
  /** Total holder count reported by the provider, when known. */
  holderCount?: number | null;
  /** Holder distribution by band, when the provider publishes one instead of a wallet list. */
  holderBands?: { top10: number | null; next10: number | null; mid: number | null; rest: number | null } | null;
  /**
   * Combined share of the ten largest wallets, when a provider states it directly rather
   * than listing them. Kept apart from `holderBands` so it answers the "top 10 hold" row
   * without inventing a one-bar distribution chart.
   */
  top10HoldPct?: number | null;
  /** Who is doing the holding: bots, snipers, bundled buys, fresh wallets. */
  holderQuality?: HolderQuality | null;
  /** The developer's own share of total supply, in percent, when the feed publishes it. */
  developerHoldingPct?: number | null;
  developer: DeveloperEvidence;
  mintAuthority: boolean | null; freezeAuthority: boolean | null; transferRestriction: boolean | null;
  migrationProgressPct: number | null;
  provider: string;
  sourceUrl?: string;
  /** Exchange / launch platform that hosts the primary pool (for example raydium, pumpfun). */
  dexName?: string | null;
  /** Quote asset of the primary pair (for example SOL, USDC). */
  quoteSymbol?: string | null;
  marketSnapshot?: { volume5m: number; volume15m: number; buys5m: number; sells5m: number; buyers5m: number | null; sellers5m: number | null };
}
export interface Settings {
  refreshSeconds: number; minLiquidityUsd: number; maxSlippagePct: number; tradeSizeUsd: number;
  minScore: number; maxAgeHours: number; notifications: boolean;
  weights: { momentum: number; liquidity: number; developer: number; price: number; holders: number; security: number };
}
export interface Metric { value: number | null; label: string }
export interface Analytics {
  volume30s: number | null; volume1m: number | null; volume5m: number; volume15m: number;
  buys5m: number; sells5m: number; buyVolume5m: number | null; sellVolume5m: number | null;
  buyers5m: number | null; sellers5m: number | null; buyerGrowth: number | null;
  volumeAcceleration: number | null; repeatBuyers: number; netPressure: number | null;
  suspiciousConcentration: boolean;
}
export interface Assessment {
  token: Token; analytics: Analytics; score: number; status: Status; confidence: Confidence;
  expiresAt: number; dataCompletenessPct: number;
  components: Record<keyof Settings['weights'], number>;
  positives: string[]; warnings: string[]; missing: string[]; critical: string[];
  entryConditions: { label: string; met: boolean }[]; invalidation: string[];
  slippagePct: number | null; concentrationPct: number | null; farmer: boolean | null;
}
export interface SignalRecord { mint: string; symbol: string; at: number; observedAt: number; expiresAt: number; status: Status; score: number; dataCompletenessPct: number; priceUsd: number | null; liquidityUsd: number | null; reasons: string[]; provider: string }
export interface PaperPosition { id: string; mint: string; symbol: string; openedAt: number; entryPrice: number; sizeUsd: number; feePct: number; slippagePct: number; status: 'open' | 'closed'; exitPrice?: number; closedAt?: number; netReturnPct?: number }
export interface TokenProvider { id: string; label: string; fetch(now: number): Promise<Token[]> }
