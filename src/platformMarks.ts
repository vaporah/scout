/**
 * Launchpad marks for the platform filter pills.
 *
 * Known protocols use locally bundled branded WebP artwork. The small line-glyph
 * vocabulary remains as a fallback for newer protocols that have no bundled mark.
 */

/** The glyph vocabulary. Every entry is stroke-only art so one style rule fits all. */
const glyphs: Record<string, string> = {
  // Upward arrow: the pump family and other "launch" pads.
  arrow: '<path d="M12 20.2V4.8"/><path d="M6.4 10.4 12 4.8l5.6 5.6"/>',
  // Droplet: Raydium.
  drop: '<path d="M12 3.4c3.7 4.5 5.6 7.4 5.6 9.8a5.6 5.6 0 0 1-11.2 0c0-2.4 1.9-5.3 5.6-9.8z"/>',
  // Orbit ring: Meteora.
  ring: '<circle cx="12" cy="12" r="4.5"/><ellipse cx="12" cy="12" rx="9.6" ry="4.1" transform="rotate(-28 12 12)"/>',
  // Layered waves: liquidity and bonding-curve pads.
  wave: '<path d="M3 15.2c2.3-3.6 4.5-3.6 6.8 0s4.5 3.6 6.8 0"/><path d="M3 9.4c2.3-3.6 4.5-3.6 6.8 0s4.5 3.6 6.8 0"/>',
  // Fin: fast, water-adjacent brands.
  fin: '<path d="M5.4 19.2c6.5 0 11.6-4.7 13.2-11.7-6.3.6-11.6 4.5-13.2 11.7z"/><path d="M8.2 15.4c1.7-.6 3.1-1.8 4.1-3.3"/>',
  // Crescent moon: moonshot family.
  moon: '<path d="M20.4 15.2A9 9 0 0 1 8.8 3.6a9 9 0 1 0 11.6 11.6z"/>',
  // Four-point star: spotlight / studio pads.
  spark: '<path d="M12 3.4 13.9 10l6.6 2-6.6 2-1.9 6.6L10.1 14 3.5 12l6.6-2z"/>',
  // Lightning bolt: surge-style pads.
  bolt: '<path d="M13.7 2.6 6.1 13.3h4.6l-1.2 8.1 8.1-11.4h-5z"/>',
  // Paw print: the dog-coin pads.
  paw: '<circle cx="8.1" cy="8.3" r="1.9"/><circle cx="15.9" cy="8.3" r="1.9"/><circle cx="5.2" cy="12.9" r="1.9"/><circle cx="18.8" cy="12.9" r="1.9"/><path d="M12 12.1c3 0 5.1 2.2 5.1 4.6s-2.1 3.6-5.1 3.6-5.1-1.2-5.1-3.6 2.1-4.6 5.1-4.6z"/>',
  // Concentric circles: minimal brands.
  dot: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="2.9"/>',
  // Tick: verified-style brands.
  check: '<path d="M4.6 12.9 9.4 17.7 19.4 7.3"/>',
  // Money bag: treasury-style brands.
  bag: '<path d="M6.7 8.4h10.6l1 11a1.8 1.8 0 0 1-1.8 2H7.5a1.8 1.8 0 0 1-1.8-2z"/><path d="M9.3 8.4V6.9a2.7 2.7 0 0 1 5.4 0v1.5"/>',
  // Flame: hype and chaos pads.
  flame: '<path d="M12 21.4c3.6 0 6-2.3 6-5.4 0-3.6-3.4-5.2-4.4-9.7-2.4 1.7-3.2 4-3.2 5.7 0 .9.3 1.6.3 2.2 0 1-.8 1.7-1.7 1.7-1.2 0-2-1-2-2.6-1.4 1.6-1 7.1 5 7.1z"/>',
  // Cloud: sky-themed pads.
  cloud: '<path d="M7.4 19.4h9.9a4.2 4.2 0 0 0 .5-8.4 5.6 5.6 0 0 0-10.8 1.4 3.6 3.6 0 0 0 .4 7z"/>',
  // Cube: block / trading-company pads.
  cube: '<path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z"/><path d="M4 7.6 12 12l8-4.4M12 12v8.8"/>',
  // Hexagon: DAO and community pads.
  hex: '<path d="M12 3 19.8 7.5v9L12 21l-7.8-4.5v-9z"/><circle cx="12" cy="12" r="2.5"/>',
  // Printer: minting / deployment pads.
  printer: '<path d="M7.6 8.5V3.6h8.8v4.9"/><path d="M5.1 8.5h13.8a1.6 1.6 0 0 1 1.6 1.6v6h-4.1v4.3H7.6v-4.3H3.5v-6a1.6 1.6 0 0 1 1.6-1.6z"/>',
  // Flask: experimental pads.
  flask: '<path d="M9.6 3v5.5L4.9 17.3A2 2 0 0 0 6.7 20h10.6a2 2 0 0 0 1.8-2.7L14.4 8.5V3"/><path d="M8.6 3h6.8M6.9 14.3h10.2"/>',
  // Coin: fee-taking / generic AMM pads.
  coin: '<circle cx="12" cy="12" r="8.4"/><path d="M9.4 9.4h5.2M9.4 14.6h5.2M12 6.9v10.2"/>',
  // Planet with a ring: studio pads.
  planet: '<circle cx="12" cy="12" r="4.4"/><ellipse cx="12" cy="12" rx="9.6" ry="3.9" transform="rotate(22 12 12)"/>',
  // Stacked slanted bars: a generic "native chain asset" motif.
  bars: '<path d="M4.5 7.5h11l-3 4h-11z"/><path d="M8.2 12.5h11l-3 4h-11z"/><path d="M11.9 17.5h7.6"/>',
  usdc: '<circle cx="12" cy="12" r="8.5"/><path d="M14.8 8.7c-.7-.7-1.6-1-2.8-1-1.5 0-2.6.8-2.6 2s1 1.8 2.8 2.2 2.8 1 2.8 2.3-1.2 2.1-2.9 2.1c-1.2 0-2.3-.4-3.1-1.2M12 5.8v2M12 16.2v2"/>',
  usdt: '<path d="M5 6.8h14M12 6.8v11.4M7.3 10.2c2.7 1 6.7 1 9.4 0"/>',
  usd1: '<circle cx="12" cy="12" r="8.5"/><path d="M10.2 9.1 12 7.8v8.4M9.7 16.2h4.6"/>'
};

/**
 * Which glyph each launchpad uses. Ids match the platform rules in categories.ts;
 * a launchpad Scout has not catalogued yet falls back to the generic hexagon.
 */
const marks: Record<string, string> = {
  pumpfun: 'arrow',
  pumpswap: 'arrow',
  raydium: 'drop',
  launchlab: 'flask',
  meteora: 'ring',
  dynamicbc: 'wave',
  orca: 'fin',
  moonshot: 'moon',
  moonit: 'spark',
  bonk: 'paw',
  bonkers: 'paw',
  boop: 'dot',
  believe: 'check',
  bags: 'bag',
  candle: 'flame',
  mayhem: 'flame',
  surge: 'bolt',
  soar: 'arrow',
  riserich: 'arrow',
  heaven: 'cloud',
  borderless: 'cube',
  sugar: 'cube',
  daos: 'hex',
  printr: 'printer',
  stonk: 'flask',
  liquid: 'wave',
  liquidaf: 'wave',
  usepaid: 'coin',
  jupiter: 'planet',
  pancake: 'coin'
};

const imageMarks: Record<string, string> = {
  dynamicbc: 'meteora',
  meteora: 'meteora',
  launchlab: 'raydium',
  pumpfun: 'pumpfun',
  pumpswap: 'pumpswap',
  raydium: 'raydium',
  orca: 'orca',
  bonk: 'bonkfun',
  boop: 'boop',
  believe: 'believe',
  bags: 'bags',
  candle: 'candle',
  daos: 'daosdotfun',
  jupiter: 'jupiter-exchange',
  pancake: 'pancakeswap'
};

export function imageMark(file: string, label: string): string {
  return `<img class="protocol-logo protocol-logo--image" src="protocol-icons/${file}.webp" alt="" title="${label}">`;
}

/** Shared wrapper: 24x24 stroke art that inherits the pill's text colour. */
function frame(body: string): string {
  return `<svg class="protocol-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/**
 * Markup for one catalogued launchpad mark, or an empty string when the platform
 * has no glyph (the caller then shows the letter monogram instead).
 */
export function platformMark(id: string): string {
  const image = imageMarks[id];
  if (image) return imageMark(image, id);
  return glyphMark(marks[id] ?? 'hex');
}

/**
 * Markup for any glyph in the vocabulary, so other pill filters (quote tokens)
 * can borrow the same artwork instead of shipping a second icon set.
 */
export function glyphMark(name: string): string {
  const body = glyphs[name];
  return body ? frame(body) : '';
}
