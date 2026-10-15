import { loadFilterIds, saveFilterIds, toggleFilterId } from './pillFilter.js';
import { glyphMark } from './platformMarks.js';
import type { Assessment } from './types.js';

/**
 * Quote-token filtering — the "what is this pool paired against" axis, next to
 * the launchpad ("which platform is this pool on") axis.
 *
 * Scout only knows the quote asset for pools where the data provider reported it,
 * so this reads the quote symbol the feed gave us (SOL, USDC, USDT, USD1, ...) and
 * sorts it into a small, stable set of buckets. Anything unrecognised — including
 * a pool whose quote asset is simply missing from the feed — lands in OTHER rather
 * than being guessed at.
 */

export interface QuoteOption {
  id: string;
  label: string;
  color: string;
  count: number;
  mark: string;
}

const storageKey = 'scout.quotes.v1';

const buckets: { id: string; label: string; color: string; glyph: string; matches: (symbol: string) => boolean }[] = [
  { id: 'sol', label: 'SOL', color: '#9945ff', glyph: 'bars', matches: symbol => symbol === 'SOL' || symbol === 'WSOL' },
  { id: 'usdc', label: 'USDC', color: '#2775ca', glyph: 'coin', matches: symbol => symbol === 'USDC' },
  { id: 'usdt', label: 'USDT', color: '#26a17b', glyph: 'coin', matches: symbol => symbol === 'USDT' },
  { id: 'usd1', label: 'USD1', color: '#f0b90b', glyph: 'coin', matches: symbol => symbol === 'USD1' },
  { id: 'other', label: 'OTHER', color: '#8b8b95', glyph: 'dot', matches: () => true }
];

/** The bucket id for one assessment; always one of the five, never empty. */
export function quoteOf(a: Assessment): string {
  const symbol = (a.token.quoteSymbol ?? '').trim().toUpperCase();
  return buckets.find(bucket => bucket.matches(symbol))?.id ?? 'other';
}

/** Every bucket in fixed order with its count, so the filter never shifts around. */
export function quoteOptions(assessments: Assessment[]): QuoteOption[] {
  const counts = new Map<string, number>();
  for (const assessment of assessments) {
    const id = quoteOf(assessment);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return buckets.map(bucket => ({
    id: bucket.id,
    label: bucket.label,
    color: bucket.color,
    count: counts.get(bucket.id) ?? 0,
    mark: glyphMark(bucket.glyph)
  }));
}

/** An empty selection means "no quote filter"; otherwise only listed buckets pass. */
export function matchesQuote(a: Assessment, selected: string[]): boolean {
  return selected.length === 0 || selected.includes(quoteOf(a));
}

export function filterByQuote(assessments: Assessment[], selected: string[]): Assessment[] {
  return assessments.filter(assessment => matchesQuote(assessment, selected));
}

/** Remembered quote selection, shared by the popup and the dashboard. */
export function loadQuoteFilter(): string[] {
  return loadFilterIds(storageKey);
}

export function saveQuoteFilter(ids: string[]): void {
  saveFilterIds(storageKey, ids);
}

/** Toggle one bucket in a selection, returning the new selection. */
export function toggleQuote(selected: string[], id: string): string[] {
  return toggleFilterId(selected, id);
}
