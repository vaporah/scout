import { mintPattern } from './dex.js';

/** Metadata claimed for one exact Solana mint; it is not a safety assessment. */
export interface WebsiteInfo {
  mint: string;
  websiteUrl: string | null;
  gtVerified: boolean | null;
  observedAt: number | null;
}

const endpoint = 'https://api.geckoterminal.com/api/v2/networks/solana/tokens/';
const cacheMs = 90_000;
const windowMs = 60_000;
const maxRequestsPerWindow = 12;
const maxBackoffMs = 300_000;
const cache = new Map<string, { at: number; info: WebsiteInfo }>();
const pending = new Map<string, Promise<WebsiteInfo>>();
let requestTimes: number[] = [];
let retryAfter = 0;
let failureStreak = 0;

type Obj = Record<string, unknown>;
const object = (value: unknown): Obj | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Obj : null;
const unknown = (mint: string): WebsiteInfo => ({ mint, websiteUrl: null, gtVerified: null, observedAt: null });

/** Only return a public HTTPS link. Never interpret a claimed site as verification. */
export function sanitizeWebsiteUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    const labels = hostname.split('.');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || labels.length < 2
      || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))
      || !/^[a-z]{2,}$/.test(labels[labels.length - 1] ?? '')
      || ['localhost', 'local', 'internal', 'invalid', 'test', 'example'].includes(labels[labels.length - 1] ?? '')) return null;
    url.search = '';
    url.hash = '';
    return url.href;
  } catch { return null; }
}

/** A result for another mint, including a case-changed one, cannot be attached to this coin. */
export function parseWebsiteInfo(payload: unknown, mint: string, now: number): WebsiteInfo | null {
  if (!mintPattern.test(mint) || !Number.isFinite(now)) return null;
  const data = object(object(payload)?.data);
  const attributes = object(data?.attributes);
  if (data?.type !== 'token' || data.id !== `solana_${mint}` || attributes?.address !== mint) return null;
  const websites = Array.isArray(attributes.websites) ? attributes.websites : [];
  const websiteUrl = websites.map(sanitizeWebsiteUrl).find((url): url is string => url !== null) ?? null;
  return { mint, websiteUrl, gtVerified: typeof attributes.gt_verified === 'boolean' ? attributes.gt_verified : null, observedAt: now };
}

function backoff(now: number, retryAfterHeader: string | null = null): void {
  failureStreak = Math.min(failureStreak + 1, 5);
  const seconds = retryAfterHeader === null ? NaN : Number(retryAfterHeader);
  const headerDelay = Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000
    : retryAfterHeader ? Date.parse(retryAfterHeader) - Date.now() : NaN;
  const delay = Number.isFinite(headerDelay) && headerDelay > 0 ? headerDelay : 15_000 * 2 ** (failureStreak - 1);
  retryAfter = Math.max(retryAfter, now + Math.min(maxBackoffMs, delay));
}

async function requestWebsiteInfo(mint: string, now: number): Promise<WebsiteInfo> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${endpoint}${encodeURIComponent(mint)}/info`, {
      headers: { Accept: 'application/json' }, signal: controller.signal
    });
    if (response.status === 429) {
      backoff(now, response.headers.get('Retry-After'));
      return unknown(mint);
    }
    if (response.status === 404) {
      const info = unknown(mint);
      cache.set(mint, { at: now, info });
      return info;
    }
    if (!response.ok) {
      backoff(now);
      return unknown(mint);
    }
    const info = parseWebsiteInfo(await response.json(), mint, now) ?? unknown(mint);
    cache.set(mint, { at: now, info });
    failureStreak = 0;
    return info;
  } catch {
    backoff(now);
    return unknown(mint);
  } finally { clearTimeout(timeout); }
}

/** Rate-limited, exact-mint lookup. Failures and unavailable data stay unknown. */
export function fetchWebsiteInfo(mint: string, now = Date.now()): Promise<WebsiteInfo> {
  if (!mintPattern.test(mint) || !Number.isFinite(now)) return Promise.resolve(unknown(mint));
  const cached = cache.get(mint);
  if (cached && now >= cached.at && now - cached.at < cacheMs) return Promise.resolve(cached.info);
  const inFlight = pending.get(mint);
  if (inFlight) return inFlight;
  requestTimes = requestTimes.filter(at => at <= now && now - at < windowMs);
  if (now < retryAfter || requestTimes.length >= maxRequestsPerWindow) return Promise.resolve(unknown(mint));
  requestTimes.push(now);
  const request = requestWebsiteInfo(mint, now).finally(() => pending.delete(mint));
  pending.set(mint, request);
  return request;
}
