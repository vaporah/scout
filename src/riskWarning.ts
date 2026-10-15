import { devReputation } from './developerReputation.js';
import type { Assessment, Settings } from './types.js';

export type Severity = 'red' | 'orange' | 'neutral' | 'green';

/**
 * One evidence-based warning shown in the top-right overlay on a token page.
 * A category is emitted only when the current assessment actually supports it.
 */
export interface RiskWarning {
  /** Stable machine id, e.g. 'farmer-dev'. */
  id: string;
  /** Human label, e.g. 'FARMER DEV'. */
  category: string;
  severity: Severity;
  headline: string;
  summary: string;
  reasons: string[];
  confidence: 'low' | 'medium' | 'high';
}

const present = (values: Array<string | null>): string[] => values.filter((value): value is string => typeof value === 'string' && value.length > 0);

/** Highest-priority warning for the current assessment, or null when nothing is flagged. */
export function warningFor(a: Assessment, settings: Settings): RiskWarning | null {
  if (a.farmer === true) {
    return {
      id: 'farmer-dev', category: 'FARMER DEV', severity: 'red', headline: 'FARMER DEV',
      summary: 'Potentially coordinated developer-linked wallet activity.',
      reasons: present([...a.critical, ...a.warnings]).slice(0, 8),
      confidence: a.confidence
    };
  }

  const criticalSecurity = present([
    a.token.freezeAuthority === true ? 'Freeze authority is active' : null,
    a.token.transferRestriction === true ? 'Transfer restriction detected' : null
  ]);
  if (criticalSecurity.length) {
    return {
      id: 'token-security', category: 'CRITICAL TOKEN SECURITY RISK', severity: 'red', headline: 'CRITICAL TOKEN SECURITY RISK',
      summary: 'The token has an active control that can block or restrict trading.',
      reasons: criticalSecurity, confidence: a.confidence
    };
  }

  const verdict = devReputation(a.token);
  if (verdict?.label === 'RISKY DEV') {
    return {
      id: 'risky-dev', category: 'RISKY DEV', severity: 'orange', headline: 'RISKY DEV',
      summary: verdict.reasons[0] ?? 'Developer track record shows concerning patterns.',
      reasons: verdict.reasons, confidence: a.confidence
    };
  }

  if (a.analytics.suspiciousConcentration) {
    return {
      id: 'wallet-cluster', category: 'SUSPICIOUS WALLET CLUSTER', severity: 'orange', headline: 'SUSPICIOUS WALLET CLUSTER',
      summary: 'Trading volume is concentrated in very few wallets.',
      reasons: ['Trading volume is concentrated in very few wallets'],
      confidence: a.confidence
    };
  }

  const liquidityProblems = present([
    a.token.liquidityChangePct !== null && a.token.liquidityChangePct < -30 ? 'Liquidity fell more than 30%' : null,
    a.slippagePct !== null && a.slippagePct > settings.maxSlippagePct
      ? `Estimated entry impact ${a.slippagePct.toFixed(1)}% exceeds the configured ${settings.maxSlippagePct}% limit`
      : null,
    a.token.liquidityUsd !== null && a.token.liquidityUsd < settings.minLiquidityUsd ? 'Liquidity below configured minimum' : null
  ]);
  if (liquidityProblems.length) {
    return {
      id: 'liquidity', category: 'LIQUIDITY WARNING', severity: 'orange', headline: 'LIQUIDITY WARNING',
      summary: 'Liquidity or execution conditions look weak.',
      reasons: liquidityProblems, confidence: a.confidence
    };
  }

  return null;
}
