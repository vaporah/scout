import { mintPattern } from './dex.js';

export interface SiteCheck {
  mint: string;
  url: string;
  origin: string;
  found: boolean;
  at: number;
}

interface BrowserApi {
  tabs?: { query(query: { active: true; currentWindow: true }): Promise<Array<{ id?: number; url?: string }>> };
  scripting?: { executeScript(args: { target: { tabId: number }; func: (mint: string) => { found: boolean; url: string }; args: [string] }): Promise<Array<{ result?: { found: boolean; url: string } }>> };
  storage?: { local?: {
    get(key: string): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
  } };
}

const browser = (): BrowserApi | undefined => (globalThis as typeof globalThis & { chrome?: BrowserApi }).chrome;
const storageKey = (mint: string): string => `scout.siteCheck.${mint}`;

/** Runs only after the user clicks Scout on a website tab. Returns no page text. */
export async function checkActiveWebsite(mint: string): Promise<SiteCheck> {
  if (!mintPattern.test(mint)) throw new Error('Paste a full Solana mint address first.');
  const api = browser();
  if (!api?.tabs?.query || !api.scripting?.executeScript) throw new Error('Website check is unavailable in this browser.');
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (typeof tab?.id !== 'number' || !tab.url) throw new Error('Open the coin website in a browser tab, then click Scout.');
  let current: URL;
  try { current = new URL(tab.url); }
  catch { throw new Error('Open the coin website in a browser tab, then click Scout.'); }
  if (current.protocol !== 'https:' || current.hostname === 'axiom.trade')
    throw new Error('Open the coin website (HTTPS), then click Scout to check its visible address.');
  const [execution] = await api.scripting.executeScript({
    target: { tabId: tab.id }, args: [mint],
    func: (address: string) => {
      const visible = document.body?.innerText ?? '';
      const characters = '1-9A-HJ-NP-Za-km-z';
      const exact = new RegExp(`(^|[^${characters}])${address}($|[^${characters}])`);
      let found = exact.test(visible);
      if (!found) for (const element of Array.from(document.querySelectorAll('[aria-label]'))) {
        const label = element.getAttribute('aria-label') ?? '';
        if (element.getClientRects().length && exact.test(label)) { found = true; break; }
      }
      return { found, url: location.href };
    }
  });
  const result = execution?.result;
  if (!result || typeof result.found !== 'boolean' || typeof result.url !== 'string') throw new Error('Could not inspect this website.');
  const inspected = new URL(result.url);
  if (inspected.protocol !== 'https:' || inspected.origin !== current.origin) throw new Error('The website changed while Scout checked it; try again.');
  const check: SiteCheck = { mint, url: inspected.href, origin: inspected.origin, found: result.found, at: Date.now() };
  await api.storage?.local?.set({ [storageKey(mint)]: check });
  return check;
}

export async function loadSiteCheck(mint: string): Promise<SiteCheck | null> {
  if (!mintPattern.test(mint)) return null;
  try {
    const value = (await browser()?.storage?.local?.get(storageKey(mint)))?.[storageKey(mint)];
    if (!value || typeof value !== 'object') return null;
    const check = value as Partial<SiteCheck>;
    if (check.mint !== mint || typeof check.url !== 'string' || typeof check.origin !== 'string'
      || typeof check.found !== 'boolean' || typeof check.at !== 'number' || !Number.isFinite(check.at)) return null;
    const url = new URL(check.url);
    return url.protocol === 'https:' && url.origin === check.origin ? check as SiteCheck : null;
  } catch { return null; }
}
