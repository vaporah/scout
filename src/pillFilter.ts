/**
 * Shared plumbing for the pill filters (launchpads, quote tokens). Both are just
 * "a bounded set of validated ids, remembered in localStorage, where an empty
 * selection means no filter at all".
 */

const ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,39}$/i;
/** Defence in depth: a stored selection can never grow without bound. */
export const maxFilterIds = 24;
/** Stored sentinel for an intentionally empty result; [] continues to mean show all. */
export const noFilterResultsId = 'scout:none';

export function validFilterIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((item): item is string => typeof item === 'string' && ID_PATTERN.test(item));
  return [...new Set(ids)].slice(0, maxFilterIds);
}

export function loadFilterIds(key: string): string[] {
  try { return validFilterIds(JSON.parse(localStorage.getItem(key) ?? '[]')); }
  catch { return []; }
}

export function saveFilterIds(key: string, ids: string[]): void {
  try { localStorage.setItem(key, JSON.stringify(validFilterIds(ids))); }
  catch { /* Storage failure must not block the list. */ }
}

/** Toggle one id in a selection, returning the new selection. */
export function toggleFilterId(selected: string[], id: string): string[] {
  if (selected.includes(noFilterResultsId)) return [id];
  return selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id];
}
