import { mintCandidates, rowText } from './axiomMint.js';

/**
 * Facts a Pulse card prints about itself. These are read straight off the visible
 * row, so they are live even when Scout has no independent evidence for the mint,
 * and they are always presented as "read from the Axiom row", never as verification.
 */
export interface RowReadings {
  symbol: string | null;
  price: string | null;
  change: string | null;
  age: string | null;
  marketCap: string | null;
  liquidity: string | null;
  volume: string | null;
  trades: string | null;
}

const genericWords = /^(?:new|pairs?|final|stretch|migrated|buy|sell|hold|copy|token|unknown|dev|chart|trade|solana|sol|usd|price|about)$/i;
const labels = /^(?:CA|MC|FDV|VOL|LIQ|DEV|TXNS?|BUYS?|SELLS?|AGE|PRICE)$/i;

const clean = (value: string | null | undefined): string | null => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text && text.length <= 32 ? text : null;
};

function symbolOf(row: Element): string | null {
  const image = row.querySelector('img[alt]');
  const alt = clean(image?.getAttribute('alt'));
  if (alt && !genericWords.test(alt) && !labels.test(alt)) return alt;
  for (const anchor of Array.from(row.querySelectorAll('a'))) {
    const text = clean(anchor.textContent);
    if (text && text.length <= 12 && !genericWords.test(text) && !/^[\d$%.\s]+$/.test(text)) return text;
  }
  return null;
}

/** Money as printed by the row, for example "$0.0000123", "$4.2K" or "$1.3M". */
function money(text: string): string | null {
  return text.match(/\$[0-9][0-9,]*(?:\.[0-9]+)?[KMB]?\b/)?.[0] ?? null;
}

/** The first percentage with an explicit sign, which is the row's 5m change. */
function change(text: string): string | null {
  return text.match(/[-+]\d+(?:\.\d+)?%/)?.[0] ?? null;
}

function labelled(text: string, names: string): string | null {
  const pattern = new RegExp(`(?:${names})\\s*:?\\s*(\\$[0-9][0-9,]*(?:\\.[0-9]+)?[KMB]?)`, 'i');
  return text.match(pattern)?.[1] ?? null;
}

/**
 * Read the live facts a visible Pulse card prints about itself. Nothing is guessed:
 * a field is returned only when the row's own text matches an unambiguous shape.
 * Adjacent elements have no whitespace in textContent, so word boundaries are
 * restored before parsing ("3mMC" becomes "3m MC").
 */
export function readRowReadings(row: Element): RowReadings {
  const raw = rowText(row);
  const text = raw
    .replace(/([a-z])(?=[A-Z%])/g, '$1 ')
    .replace(/([a-z%])(?=[0-9])/gi, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
  const money0 = money(text);
  return {
    symbol: symbolOf(row),
    // The first printed price is the current price; later figures carry their own label.
    price: money0,
    change: change(text),
    age: text.match(/(?:^|[^0-9A-Za-z])(\d{1,4}\s?(?:s|m|h|d))(?![0-9A-Za-z])/)?.[1] ?? null,
    marketCap: labelled(text, 'MC|mcap|market cap|fdv'),
    liquidity: labelled(text, 'liq|liquidity'),
    volume: labelled(text, 'vol|volume'),
    trades: text.match(/(\d{1,5})\s*\/\s*(\d{1,5})(?![0-9])/)?.[0] ?? null
  };
}

export function hasReadings(readings: RowReadings | null | undefined): boolean {
  if (!readings) return false;
  return Object.values(readings).some(value => value !== null);
}

/** Does this row expose exactly one full mint anywhere in its own attributes or text? */
export function rowMint(row: Element, base?: string): string | null {
  const mints = mintCandidates(row, base);
  return mints.size === 1 ? [...mints][0] ?? null : null;
}
