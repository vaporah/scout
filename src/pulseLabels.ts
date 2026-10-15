import type { Stage } from './types.js';

/**
 * Classification labels Axiom prints inside each Pulse row (e.g. "UNKNOWN CA
 * TECH LARPP", "FARMER SPRAY EU TECH LARPP"). These are page observations, not
 * independent verification; they are shown as Axiom labels, never as proof.
 */
export interface PulseLabels {
  /** Developer classification: FARMER or UNKNOWN. */
  dev: string | null;
  /** Region / country code when recognised. */
  region: string | null;
  /** Narrative category tag TECH. */
  tech: boolean;
  /** Liquidity-at-risk tag LARPP. */
  larpp: boolean;
  /** Other recognised tags (SPRAY, BUNDLE, VSA, SPRT, ...). */
  others: string[];
  /** Every recognised tag, in the order they appeared. */
  all: string[];
}

export const stageLabels: Record<Stage, string> = {
  new: 'New Pairs',
  bonding: 'Final Stretch',
  migrated: 'Migrated',
  unknown: 'Unknown stage'
};

export function stageLabel(stage: Stage): string {
  return stageLabels[stage] ?? stageLabels.unknown;
}

export function stageFromHeading(label: string): Stage {
  if (label === 'New Pairs') return 'new';
  if (label === 'Final Stretch') return 'bonding';
  if (label === 'Migrated') return 'migrated';
  return 'unknown';
}

const tagKinds: Record<string, 'dev' | 'region' | 'tech' | 'liquidity' | 'other'> = {
  FARMER: 'dev', UNKNOWN: 'dev',
  CA: 'region', US: 'region', USA: 'region', AUS: 'region', AU: 'region', EU: 'region', SG: 'region', NOR: 'region', TW: 'region', UK: 'region', GB: 'region',
  TECH: 'tech',
  LARPP: 'liquidity',
  SPRAY: 'other', BUNDLE: 'other', SPRT: 'other', VSA: 'other', GOOD: 'other', WARM: 'other'
};

const tokenPattern = /^[A-Z]{2,8}$/;

/** Extract recognised uppercase tags from arbitrary row text. Unknown words are ignored. */
export function parsePulseLabels(text: string): PulseLabels {
  const all: string[] = [];
  const others: string[] = [];
  let dev: string | null = null;
  let region: string | null = null;
  let tech = false;
  let larpp = false;
  for (const raw of String(text ?? '').split(/[\s/|,;·•]+/)) {
    const token = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').toUpperCase();
    if (!tokenPattern.test(token)) continue;
    const kind = tagKinds[token];
    if (!kind) continue;
    all.push(token);
    if (kind === 'dev' && dev === null) dev = token;
    else if (kind === 'region' && region === null) region = token;
    else if (kind === 'tech') tech = true;
    else if (kind === 'liquidity') larpp = true;
    else others.push(token);
  }
  return { dev, region, tech, larpp, others, all };
}

/** Read the page labels from a visible Pulse row. */
export function extractRowLabels(row: Element): PulseLabels {
  return parsePulseLabels(row.textContent ?? '');
}

/** Human-readable summary of the labels, or null when none were recognised. */
export function formatPulseLabels(labels: PulseLabels): string | null {
  const parts = [labels.dev, labels.region, labels.tech ? 'TECH' : null, labels.larpp ? 'LARPP' : null, ...labels.others]
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  return parts.length ? parts.join(' \u00b7 ') : null;
}
