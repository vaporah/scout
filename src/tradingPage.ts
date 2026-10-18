import { axiomPageMint } from './axiomMint.js';
import { mintFromGmgnUrl } from './gmgnMint.js';
import { mintFromPadreUrl } from './padreMint.js';

export type TradingPlatform = 'Axiom' | 'GMGN' | 'Padre';

export interface TradingPageIdentity {
  platform: TradingPlatform;
  mint: string;
}

/** Identify an exact token page without sharing any platform's DOM adapter. */
export function tradingPageIdentity(href: string): TradingPageIdentity | null {
  const axiom = axiomPageMint(href);
  if (axiom) return { platform: 'Axiom', mint: axiom };
  const gmgn = mintFromGmgnUrl(href);
  if (gmgn) return { platform: 'GMGN', mint: gmgn };
  const padre = mintFromPadreUrl(href);
  if (padre) return { platform: 'Padre', mint: padre };
  return null;
}
