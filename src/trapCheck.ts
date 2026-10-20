import { devReputation, isRiskyDevVerdict } from './developerReputation.js';
import { holderConcentration } from './analytics.js';
import type { Assessment } from './types.js';

export type TrapVerdict = 'RED' | 'YELLOW' | 'GREEN' | 'UNKNOWN';

export interface TrapCheck {
  verdict: TrapVerdict;
  redFlags: string[];
  warnings: string[];
  clean: string[];
  missing: string[];
}

/** A compact trap read with provenance-friendly facts and an explicit unknown state. */
export function trapCheck(a: Assessment): TrapCheck {
  const token = a.token;
  const quality = token.holderQuality;
  const concentration = holderConcentration(token);
  const redFlags: string[] = [];
  const warnings: string[] = [];
  const clean: string[] = [];
  const missing: string[] = [];

  if (token.insiderFlow?.status === 'exit') {
    if ((token.insiderFlow.soldPct ?? 0) >= 10) redFlags.push(`identified insiders shed ${token.insiderFlow.soldPct!.toFixed(1)}% of supply`);
    if ((token.insiderFlow.liquidityDropPct ?? 0) >= 30) redFlags.push(`liquidity fell ${token.insiderFlow.liquidityDropPct!.toFixed(1)}% from Scout's observed peak`);
  }
  if (a.farmer === true) redFlags.push('verified developer-linked funding, distribution and coordinated sales');
  if (token.freezeAuthority === true) redFlags.push('freeze authority is active');
  if (token.transferRestriction === true) redFlags.push('transfer restrictions detected');
  if ((quality?.sniperPct ?? 0) >= 50) redFlags.push(`${quality!.sniperPct!.toFixed(1)}% held by wallets classified as launch snipers`);
  if ((quality?.bundlerPct ?? 0) >= 50) redFlags.push(`${quality!.bundlerPct!.toFixed(1)}% attributed to bundled launch buys`);

  if (token.insiderFlow?.status === 'selling' && token.insiderFlow.soldPct !== null)
    warnings.push(`identified insiders shed ${token.insiderFlow.soldPct.toFixed(1)}% of supply`);
  if (token.mintAuthority === true) warnings.push('mint authority is active');
  if (concentration !== null && concentration > 50) warnings.push(`top reported holders control ${concentration.toFixed(1)}% of supply`);
  if ((quality?.freshWalletPct ?? 0) >= 60) warnings.push(`${quality!.freshWalletPct!.toFixed(1)}% held by fresh wallets`);
  const dev = devReputation(token);
  if (isRiskyDevVerdict(dev)) warnings.push(...dev.reasons.slice(0, 2));

  if (token.freezeAuthority === false) clean.push('freeze authority revoked');
  else if (token.freezeAuthority === null) missing.push('freeze authority');
  if (token.mintAuthority === false) clean.push('mint authority revoked');
  else if (token.mintAuthority === null) missing.push('mint authority');
  if (token.transferRestriction === false) clean.push('no transfer restriction reported');
  else if (token.transferRestriction === null) missing.push('transfer controls');
  if (concentration !== null) clean.push(`top reported holders control ${concentration.toFixed(1)}%`);
  else missing.push('holder concentration');
  if (typeof token.developerHoldingPct === 'number') clean.push(`developer holds ${token.developerHoldingPct.toFixed(2)}%`);
  else missing.push('developer holding');
  if (quality?.sniperPct === null || quality?.sniperPct === undefined) missing.push('sniper classification');
  if (quality?.bundlerPct === null || quality?.bundlerPct === undefined) missing.push('bundle classification');

  const verdict: TrapVerdict = redFlags.length ? 'RED'
    : warnings.length ? 'YELLOW'
    : missing.length ? 'UNKNOWN'
    : 'GREEN';
  return { verdict, redFlags, warnings, clean, missing };
}
