import { hotCoin, runningWithoutVerdict } from './attention.js';
import { mintPattern } from './dex.js';
import type { Assessment, Settings, Stage } from './types.js';
import { signalClass } from './ui.js';

export interface PulseRow {
  element: HTMLElement;
  mint: string;
  /** Axiom column the row was found in, when known. */
  stage?: Stage;
}

const signalClasses = ['scout-pulse-green', 'scout-pulse-amber', 'scout-pulse-red', 'scout-pulse-gray', 'scout-pulse-run', 'scout-pulse-neutral'] as const;
/** Additive bright + animated highlight for a hot coin. Kept out of signalClasses
 * so it never reads as a verdict colour of its own. */
export const hotClass = 'scout-pulse-hot';

/** Applies shared, mint-keyed assessments to rows supplied by an authorized page adapter. */
export function applyPulseSignals(rows: Iterable<PulseRow>, assessments: Iterable<Assessment>, settings: Settings, now = Date.now()): number {
  const byMint = new Map<string, Assessment>();
  for (const assessment of assessments) {
    if (!mintPattern.test(assessment.token.mint) || assessment.token.provider === 'SIMULATED DEMO') continue;
    if (assessment.token.observedAt > now + 60_000 || assessment.expiresAt < now) continue;
    const previous = byMint.get(assessment.token.mint);
    if (!previous || assessment.token.observedAt > previous.token.observedAt) byMint.set(assessment.token.mint, assessment);
  }

  let coloured = 0;
  for (const { element, mint } of rows) {
    element.classList.remove(...signalClasses, hotClass);
    element.removeAttribute('data-scout-mint');
    element.removeAttribute('data-scout-status');
    element.removeAttribute('data-scout-hot');
    if (!mintPattern.test(mint)) continue;
    const assessment = byMint.get(mint);
    if (!assessment) continue;
    const signal = signalClass(assessment, settings);
    const style = runningWithoutVerdict(assessment, settings) ? 'scout-pulse-run'
      : signal === 'signal-green' ? 'scout-pulse-green' : signal === 'signal-amber' ? 'scout-pulse-amber' : signal === 'signal-red' ? 'scout-pulse-red' : 'scout-pulse-gray';
    element.classList.add(style);
    element.dataset.scoutMint = mint;
    element.dataset.scoutStatus = assessment.status;
    // A hot coin keeps its verdict colour and gains the bright animated ring on top.
    const hot = hotCoin(assessment, settings);
    if (hot) {
      element.classList.add(hotClass);
      element.dataset.scoutHot = hot.detail;
    }
    coloured++;
  }
  return coloured;
}
