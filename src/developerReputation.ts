import type { Token } from './types.js';

export interface DevVerdict {
  label: string;
  tone: 'red' | 'orange' | 'neutral' | 'green';
  reasons: string[];
}

export const BWA_DEVELOPER_WALLET = 'bwamJzztZsepfkteWRChggmXuiiCQvpLqPietdNfSXa';

/** Public developer identities explicitly maintained by Scout's local watchlist. */
const watchedDevelopers = new Map<string, { label: string; reasons: string[] }>([
  [BWA_DEVELOPER_WALLET, {
    label: 'BWA DEV',
    reasons: ['Creator wallet matches the BWA developer watchlist; treat this developer as risky']
  }]
]);

export function isRiskyDevVerdict(verdict: DevVerdict | null): verdict is DevVerdict & { tone: 'orange' } {
  return verdict?.tone === 'orange';
}

/**
 * Evidence-based developer reputation from observable launch history.
 * A bad track record yields RISKY DEV; missing evidence stays UNKNOWN DEV.
 * This never claims a new wallet is malicious, and "PROVEN DEV" is only shown
 * from Axiom's own page badge, never asserted from independent data alone.
 */
export function devReputation(token: Token): DevVerdict | null {
  const dev = token.developer;
  const watched = dev.creator ? watchedDevelopers.get(dev.creator) : null;
  if (watched) return { label: watched.label, tone: 'orange', reasons: watched.reasons };
  const reasons: string[] = [];
  if (dev.priorLaunches !== null && dev.rapidFailures !== null && dev.priorLaunches >= 5 && dev.rapidFailures >= 3)
    reasons.push(`${dev.rapidFailures} rapid failures across ${dev.priorLaunches} prior launches`);
  if (dev.linkedSales !== null && dev.linkedSales > 0)
    reasons.push(`${dev.linkedSales} creator-linked sale(s) observed`);
  if (reasons.length) return { label: 'RISKY DEV', tone: 'orange', reasons };
  if (dev.source === 'unknown')
    return { label: 'UNKNOWN DEV', tone: 'neutral', reasons: ['Creator identity and launch history are unverified'] };
  return null;
}

export interface DevStatus {
  label: 'GOOD DEV' | 'RISKY DEV' | 'BWA DEV' | 'UNKNOWN DEV';
  tone: 'green' | 'orange' | 'neutral';
  reasons: string[];
}

/** Plain-language developer verdict for the popup: good, bad, or unknown. */
export function devStatus(token: Token): DevStatus {
  const verdict = devReputation(token);
  if (!verdict) {
    const dev = token.developer;
    return {
      label: 'GOOD DEV', tone: 'green',
      reasons: [`Verified creator${dev.priorLaunches !== null ? ` with ${dev.priorLaunches} prior launches` : ''} and no rapid failures or linked selling in the available data`]
    };
  }
  return isRiskyDevVerdict(verdict)
    ? { label: verdict.label as 'RISKY DEV' | 'BWA DEV', tone: 'orange', reasons: verdict.reasons }
    : { label: 'UNKNOWN DEV', tone: 'neutral', reasons: verdict.reasons };
}
