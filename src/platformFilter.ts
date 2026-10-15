import { knownPlatforms, tokenTags } from './categories.js';
import { loadFilterIds, saveFilterIds, toggleFilterId, validFilterIds } from './pillFilter.js';
import { platformMark } from './platformMarks.js';
import type { Assessment } from './types.js';

/**
 * Launchpad / pool platform filtering. The key comes from the pool DEX the data
 * provider reports (pumpfun, raydium, meteora, orca, ...), which is the platform a
 * coin currently trades on. A coin that migrated keeps its new platform, so this
 * filter answers "which platform is this pool on", not "where was it born".
 */

export interface PlatformOption {
  id: string;
  label: string;
  color: string;
  count: number;
  /** Inline SVG for the launchpad mark; empty when the platform has no glyph. */
  mark: string;
}

const storageKey = 'scout.platforms.v1';
const ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,39}$/i;
/** Every coin whose feed reported no DEX shares this bucket, so it can be filtered too. */
export const unknownPlatformId = 'unknown';

/** Platform id for one assessment, or the unknown bucket when the feed reported none. */
export function platformOf(a: Assessment): string {
  const platform = tokenTags(a.token).find(tag => tag.kind === 'platform');
  return platform ? platform.id : unknownPlatformId;
}

export function platformLabel(id: string): string {
  if (id === unknownPlatformId) return 'Unknown platform';
  if (id.startsWith('dex:')) return id.slice(4).replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
  return id.replace(/[-_]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

/** Platforms present in the current observations, busiest first. */
export function platformOptions(assessments: Assessment[]): PlatformOption[] {
  const counts = new Map<string, { label: string; color: string; count: number }>();
  for (const assessment of assessments) {
    const tag = tokenTags(assessment.token).find(candidate => candidate.kind === 'platform');
    const id = tag ? tag.id : unknownPlatformId;
    if (!ID_PATTERN.test(id)) continue;
    const existing = counts.get(id);
    if (existing) existing.count++;
    else counts.set(id, { label: tag ? tag.label : 'Unknown platform', color: tag ? tag.color : '#b5a4aa', count: 1 });
  }
  return [...counts].map(([id, value]) => ({ id, label: value.label, color: value.color, count: value.count, mark: platformMark(id) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/**
 * The whole launchpad catalogue, not just what is on screen, so the filter can
 * reach every platform Scout knows about — the same way the Axiom protocol list
 * always offers every launchpad. Platforms with coins in this scan come first
 * (in catalogue order, so the list stays stable between scans) and the idle ones
 * follow, each carrying its own count so a zero is visible rather than implied.
 *
 * The unknown bucket is deliberately left out: it is not a launchpad, and the
 * coins in it are already visible whenever no launchpad filter is set.
 */
export function platformCatalogue(assessments: Assessment[]): PlatformOption[] {
  const counts = new Map(platformOptions(assessments).map(option => [option.id, option]));
  counts.delete(unknownPlatformId);
  const busy: PlatformOption[] = [];
  const idle: PlatformOption[] = [];
  for (const platform of knownPlatforms) {
    if (!ID_PATTERN.test(platform.id)) continue;
    const seen = counts.get(platform.id);
    const option = { ...platform, count: seen?.count ?? 0, mark: platformMark(platform.id) };
    (option.count > 0 ? busy : idle).push(option);
    counts.delete(platform.id);
  }
  // Anything the feed reported that is not catalogued (a launchpad Axiom has just
  // added) keeps its place rather than being dropped by the filter.
  return [...busy, ...[...counts.values()], ...idle];
}

/** An empty selection means "no launchpad filter"; otherwise only listed platforms pass. */
export function matchesPlatform(a: Assessment, selected: string[]): boolean {
  return selected.length === 0 || selected.includes(platformOf(a));
}

export function filterByPlatform(assessments: Assessment[], selected: string[]): Assessment[] {
  return assessments.filter(assessment => matchesPlatform(assessment, selected));
}

/** Validated platform ids, bounded and pattern-checked. */
export const validPlatformIds = validFilterIds;

/** Remembered launchpad selection, shared by the popup and the dashboard. */
export function loadPlatformFilter(): string[] {
  return loadFilterIds(storageKey);
}

export function savePlatformFilter(ids: string[]): void {
  saveFilterIds(storageKey, ids);
}

/** Toggle one platform in a selection, returning the new selection. */
export function togglePlatform(selected: string[], id: string): string[] {
  return toggleFilterId(selected, id);
}
