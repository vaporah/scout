import { mintPattern } from './dex.js';
import type { HolderShare, Token } from './types.js';

type ObjectValue = Record<string, unknown>;
type SecurityFields = Pick<Token, 'mintAuthority' | 'freezeAuthority' | 'transferRestriction' | 'holders' | 'holderCount'>;

const endpoint = 'https://api.gopluslabs.io/api/v1/solana/token_security';
const positiveCacheMs = 120_000;
const negativeCacheMs = 60_000;
const maxRequestsPerMinute = 10;
const maxTokensPerScan = 8;
const cache = new Map<string, { at: number; fields: SecurityFields | null }>();
let requestTimes: number[] = [];
let retryAfter = 0;

const object = (value: unknown): ObjectValue | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : null;
const binary = (value: unknown): boolean | null => value === '1' ? true : value === '0' ? false : null;
const status = (value: unknown): boolean | null => binary(object(value)?.status);

function transferRestriction(info: ObjectValue): boolean | null {
  const nonTransferable = binary(info.non_transferable);
  const defaultState = info.default_account_state === '2' ? true : info.default_account_state === '1' ? false : null;
  const hook = Array.isArray(info.transfer_hook) ? info.transfer_hook.length > 0 : null;
  const fee = object(info.transfer_fee);
  const hasFee = fee ? Object.keys(fee).length > 0 : null;
  if (nonTransferable === true || defaultState === true) return true;
  // A hook, fee, or upgrade authority may deserve review, but none proves that transfers are blocked.
  const otherControls = [
    status(info.balance_mutable_authority), status(info.closable),
    status(info.default_account_state_upgradable), status(info.transfer_hook_upgradable),
    status(info.transfer_fee_upgradable)
  ];
  return nonTransferable === false && defaultState === false && hook === false && hasFee === false && otherControls.every(value => value === false) ? false : null;
}

/**
 * The top holders GoPlus reports. `percent` arrives as a fraction of total supply,
 * so it is converted to percent once, here, and never re-derived further out.
 */
function holderList(value: unknown): HolderShare[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const holders: HolderShare[] = [];
  const seen = new Set<string>();
  for (const entry of value.slice(0, 10)) {
    const holder = object(entry);
    const wallet = holder?.account;
    const fraction = typeof holder?.percent === 'string' && holder.percent.trim() ? Number(holder.percent) : NaN;
    if (typeof wallet !== 'string' || !mintPattern.test(wallet) || seen.has(wallet)) return null;
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) return null;
    seen.add(wallet);
    holders.push({
      wallet,
      pct: fraction * 100,
      // GoPlus does not label pool or burn addresses on this endpoint, so nothing is
      // assumed here: an unlabelled address is an ordinary wallet, and the popup says so.
      type: 'wallet',
      tag: typeof holder?.tag === 'string' && holder.tag.trim() ? holder.tag.trim() : null,
      locked: holder?.is_locked === 1
    });
  }
  return holders.length ? holders : null;
}

/**
 * The holder breakdown plus the reported holder count. A list shorter than ten is
 * only trusted when the reported count agrees, so a truncated response is never
 * presented as "these are the top ten".
 */
function holderSnapshot(info: ObjectValue): { holders: HolderShare[]; holderCount: number | null } | null {
  const count = Number(info.holder_count);
  const holderCount = Number.isSafeInteger(count) && count > 0 ? count : null;
  const holders = holderList(info.holders);
  if (!holders) return null;
  if (holderCount !== null && holders.length < Math.min(10, holderCount)) return null;
  const total = holders.reduce((sum, holder) => sum + holder.pct, 0);
  return total <= 100.1 ? { holders, holderCount } : null;
}

/** Read only the exact case-sensitive mint key. Absent or ambiguous fields stay unknown. */
export function parseGoPlusSecurity(payload: unknown, mint: string): SecurityFields | null {
  if (!mintPattern.test(mint)) return null;
  const response = object(payload);
  const result = object(response?.result);
  if (response?.code !== 1 || !result || !Object.prototype.hasOwnProperty.call(result, mint)) return null;
  const info = object(result[mint]);
  if (!info) return null;
  const breakdown = holderSnapshot(info);
  const fields: SecurityFields = {
    mintAuthority: status(info.mintable),
    freezeAuthority: status(info.freezable),
    transferRestriction: transferRestriction(info),
    holders: breakdown?.holders ?? null,
    holderCount: breakdown?.holderCount ?? null
  };
  return fields.mintAuthority !== null || fields.freezeAuthority !== null || fields.transferRestriction !== null || fields.holders !== null ? fields : null;
}

async function fetchSecurity(mint: string, now: number): Promise<SecurityFields | null> {
  const previous = cache.get(mint);
  if (previous && now - previous.at < (previous.fields ? positiveCacheMs : negativeCacheMs)) return previous.fields;
  requestTimes = requestTimes.filter(at => now - at < 60_000);
  if (now < retryAfter || requestTimes.length >= maxRequestsPerMinute) return null;
  requestTimes.push(now);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${endpoint}?contract_addresses=${encodeURIComponent(mint)}`, { signal: controller.signal });
    if (response.status === 429 || response.status === 503) {
      const seconds = Number(response.headers.get('Retry-After'));
      retryAfter = now + (Number.isFinite(seconds) && seconds > 0 ? Math.min(300, seconds) : response.status === 429 ? 60 : 30) * 1000;
      return null;
    }
    if (!response.ok) return null;
    const fields = parseGoPlusSecurity(await response.json(), mint);
    cache.set(mint, { at: now, fields });
    return fields;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function withSecurity(token: Token, fields: SecurityFields | null): Token {
  if (!fields) return token;
  return {
    ...token,
    mintAuthority: token.mintAuthority ?? fields.mintAuthority,
    freezeAuthority: token.freezeAuthority ?? fields.freezeAuthority,
    transferRestriction: token.transferRestriction ?? fields.transferRestriction,
    holders: token.holders ?? fields.holders,
    holderCount: token.holderCount ?? fields.holderCount,
    developer: token.developer.source === 'unknown' ? {
      ...token.developer,
      note: 'Creator identity and launch history remain unverified. GoPlus supplies the token-control and holder fields shown; missing fields remain unknown.'
    } : token.developer,
    provider: token.provider.includes('GoPlus') ? token.provider : `${token.provider} + GoPlus security`
  };
}

/** Prioritize explicitly tracked mints and bound calls on shared public infrastructure. */
export async function enrichTokensWithGoPlus(tokens: Token[], now: number, priorityMints: readonly string[] = []): Promise<Token[]> {
  const byMint = new Map(tokens.filter(token => mintPattern.test(token.mint)).map(token => [token.mint, token]));
  const selected = [...new Set([...priorityMints, ...tokens.map(token => token.mint)])]
    .filter(mint => byMint.has(mint)).slice(0, maxTokensPerScan);
  const entries = await Promise.all(selected.map(async mint => [mint, await fetchSecurity(mint, now)] as const));
  const found = new Map(entries);
  return tokens.map(token => withSecurity(token, found.get(token.mint) ?? null));
}
