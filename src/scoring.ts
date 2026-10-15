import { analyze, estimateSlippagePct, holderConcentration } from './analytics.js';
import { devReputation } from './developerReputation.js';
import type { Assessment, Settings, Token } from './types.js';

const clamp = (n: number) => Math.min(1, Math.max(0, n));
const scaled = (fraction: number, max: number) => Math.round(clamp(fraction) * max);
/**
 * 5m volume worth this much of the pool, i.e. the pool turned over once inside five
 * minutes. Set here rather than tuned per call so the momentum score and the reason
 * shown in the popup can never disagree about what counts as genuinely moving.
 */
export const hotTurnover = 1;
export function assess(token: Token, settings: Settings, now: number): Assessment {
  const a = analyze(token, now);
  const w = settings.weights;
  const positives: string[] = [], warnings: string[] = [], missing: string[] = [], critical: string[] = [];
  const concentration = holderConcentration(token);
  const slippage = estimateSlippagePct(token.liquidityUsd, settings.tradeSizeUsd);
  const dev = token.developer;
  const evidence = dev.farmerEvidence;
  const farmer = dev.source !== 'verified' ? null : evidence
    ? evidence.linkedWallets.length >= 3 && evidence.fundingTransactions.length > 0 && evidence.distributionTransactions.length > 0 && evidence.coordinatedSaleTransactions.length >= 2
    : null;
  const expiresAt = token.observedAt + Math.max(90_000, settings.refreshSeconds * 3_000);
  const stale = now > expiresAt;
  const liquidityOK = token.liquidityUsd !== null && token.liquidityUsd >= settings.minLiquidityUsd;
  const slippageOK = slippage !== null && slippage <= settings.maxSlippagePct;
  if (stale) warnings.push('Market observation is stale');
  if (token.liquidityUsd === null) missing.push('Pool liquidity');
  else if (!liquidityOK) warnings.push('Liquidity below configured minimum');
  if (slippage === null) missing.push('Entry slippage estimate');
  else if (!slippageOK) warnings.push('Estimated entry price impact is high');
  if (token.liquidityChangePct !== null && token.liquidityChangePct < -30) critical.push('Liquidity fell more than 30%');
  if (token.freezeAuthority === true) critical.push('Freeze authority is active');
  if (token.transferRestriction === true) critical.push('Transfer restriction detected');
  if (token.mintAuthority === true) warnings.push('Mint authority is active');
  if (token.priceChange5mPct !== null && token.priceChange5mPct <= -25) warnings.push('Price fell at least 25% in 5m');
  if (token.mintAuthority === null || token.freezeAuthority === null || token.transferRestriction === null) missing.push('Token authority / extension checks');
  if (farmer === true) critical.push('FARMER DEV: verified funding, token distribution and coordinated sales across linked wallets');
  const devVerdict = devReputation(token);
  if (devVerdict?.label === 'RISKY DEV') warnings.push(`RISKY DEV: ${devVerdict.reasons.join('; ')}`);
  if (dev.creator === null) missing.push('Verified creator identity and launch history');
  else if (dev.priorLaunches === null) missing.push('Developer prior-launch history');
  if (concentration === null) missing.push('Holder distribution');
  else if (concentration > 50) warnings.push(`Top 10 reported holders account for ${concentration.toFixed(1)}% of supply; pool/burn classification may be incomplete`);
  if (a.suspiciousConcentration) warnings.push('Trading volume is concentrated in very few wallets');
  if (a.volume5m === 0) missing.push('Recent trade observations');
  if (a.buyerGrowth === null) missing.push('Buyer-growth baseline');
  if (a.volumeAcceleration === null) missing.push('Volume-acceleration baseline');
  const buyCountLead = a.buys5m >= 5 && a.buys5m > a.sells5m * 1.5;
  // Unique buying wallets are not published by the pool feed, so an unknown count must
  // not be read as "nobody bought": fall back to the buy count, which is published.
  // Treating the missing count as zero silently zeroed this whole component and made
  // the top tiers unreachable for every row on the Pulse table.
  const buyerEvidence = a.buyers5m !== null ? a.buyers5m >= 3 : a.buys5m >= 3;
  const momentumEvidence = a.volume5m > 0 && buyerEvidence;
  // Volume against pool liquidity is the one measure of "this is genuinely moving" that
  // needs nothing but the numbers that are always present. A pool turning over its own
  // liquidity inside five minutes is real activity, whatever else is unknown.
  const turnover = token.liquidityUsd !== null && token.liquidityUsd > 0 && a.volume5m > 0
    ? a.volume5m / token.liquidityUsd
    : null;
  const strongTurnover = turnover !== null && turnover >= hotTurnover;
  // Momentum reads intensity rather than whether a bar was crossed. Binary thresholds
  // scored a pool turning over ten times identically to one turning over twice, and a
  // coin with real volume identically to a dead one, which left the score unable to
  // tell the two apart at all.
  const buyPressure = a.sells5m > 0
    ? Math.min(1, Math.max(0, a.buys5m / a.sells5m - 1))
    : (a.buys5m > 0 ? 1 : 0);
  // Smooth 0..1 curve: no cliff at the threshold, and extreme turnover keeps adding
  // a little instead of flattening out completely.
  const intensity = turnover === null ? 0 : turnover / (turnover + 1);
  const momentum = scaled((momentumEvidence ? .2 : 0) + (token.marketSnapshot && buyCountLead ? .2 : 0) + (buyPressure * .2) + (intensity * .25) + (a.netPressure !== null && a.netPressure > .15 ? .15 : 0) + (a.buyerGrowth !== null && a.buyerGrowth > .2 ? .15 : 0) + (a.volumeAcceleration !== null && a.volumeAcceleration > 1.3 ? .1 : 0) - (a.suspiciousConcentration ? .5 : 0), w.momentum);
  const liquidity = scaled((liquidityOK ? .6 : 0) + (slippageOK ? .25 : 0) + (token.liquidityChangePct !== null && token.liquidityChangePct >= 0 ? .15 : 0), w.liquidity);
  const developer = scaled(dev.source === 'unknown' ? 0 : (farmer ? .1 : .7) + (dev.linkedSales === 0 ? .3 : 0), w.developer);
  const price = scaled(token.priceChange5mPct === null ? 0 : token.priceChange5mPct > 1 && token.priceChange5mPct < 45 ? .75 : token.priceChange5mPct >= 45 ? .2 : .35, w.price);
  const holders = scaled(concentration === null ? 0 : concentration < 30 ? 1 : concentration < 50 ? .6 : .1, w.holders);
  const security = scaled(token.mintAuthority === null || token.freezeAuthority === null || token.transferRestriction === null ? 0 : token.mintAuthority || token.freezeAuthority || token.transferRestriction ? .1 : 1, w.security);
  const components = { momentum, liquidity, developer, price, holders, security };
  const score = Object.values(components).reduce((sum, n) => sum + n, 0);
  if (a.buyerGrowth !== null && a.buyerGrowth > .2) positives.push('Unique buyers accelerating vs previous minute');
  if (a.netPressure !== null && a.netPressure > .15) positives.push('Net buying pressure positive');
  if (a.volumeAcceleration !== null && a.volumeAcceleration > 1.3) positives.push('Volume above previous-minute baseline');
  if (token.marketSnapshot && buyCountLead) positives.push('Buy transactions outnumber sells in 5m (counts, not volume)');
  if (strongTurnover && turnover !== null) positives.push(`5m volume is ${turnover.toFixed(1)}\u00d7 the pool liquidity`);
  if (liquidityOK) positives.push('Liquidity above configured minimum');
  if (slippageOK) positives.push('Estimated entry impact within limit (constant-product approximation)');
  const entryConditions = [
    { label: 'Buyers accelerating', met: a.buyerGrowth !== null && a.buyerGrowth > .2 },
    { label: 'Positive net buying pressure', met: a.netPressure !== null && a.netPressure > .15 },
    { label: 'Volume growth', met: a.volumeAcceleration !== null && a.volumeAcceleration > 1.3 },
    { label: 'Enough liquidity', met: liquidityOK },
    { label: 'Acceptable estimated impact', met: slippageOK },
    { label: 'No critical risk', met: critical.length === 0 },
    { label: 'Security and creator data available', met: dev.source !== 'unknown' && token.mintAuthority !== null && token.freezeAuthority !== null && token.transferRestriction !== null }
  ];
  const confidence = stale || missing.length >= 3 ? 'low' : missing.length > 0 ? 'medium' : 'high';
  const completenessChecks = [token.liquidityUsd !== null, token.priceChange5mPct !== null, Boolean(token.marketSnapshot || token.trades.length), a.buyers5m !== null, dev.creator !== null, dev.priorLaunches !== null, concentration !== null, token.mintAuthority !== null, token.freezeAuthority !== null, token.transferRestriction !== null];
  const dataCompletenessPct = Math.round(completenessChecks.filter(Boolean).length / completenessChecks.length * 100);
  const status = critical.length ? 'DISQUALIFIED' : farmer || a.suspiciousConcentration ? 'HIGH RISK' : stale || token.liquidityUsd === null ? 'UNKNOWN / INCOMPLETE' : score >= settings.minScore && entryConditions.every(c => c.met) && confidence !== 'low' ? 'TOP CANDIDATE' : liquidityOK && (score >= 55 || token.marketSnapshot && buyCountLead && a.volume5m >= 1000) ? 'WATCH' : 'WAIT FOR CONFIRMATION';
  return {
    token, analytics: a, score, status, confidence, expiresAt, dataCompletenessPct, components, positives, warnings, missing, critical,
    entryConditions, slippagePct: slippage, concentrationPct: concentration, farmer,
    invalidation: [`Liquidity under $${settings.minLiquidityUsd.toLocaleString()}`, 'Net buying pressure turns negative', 'New critical developer or token-control evidence']
  };
}
