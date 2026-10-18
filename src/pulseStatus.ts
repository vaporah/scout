import type { Assessment } from './types.js';

const key = 'scout.pulseStatus.v1';

export interface PulseStatus {
  onPulse: boolean;
  visibleRows: number;
  matchedRows: number;
  colouredRows: number;
  at: number;
  /** Exact-mint artwork already visible on the host page, never matched by ticker. */
  coinImages?: Record<string, string>;
  /** Fresh assessments for the rows currently visible in Trenches. */
  assessments?: Assessment[];
}

interface StorageApi {
  storage?: { local?: {
    get(key: string): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void> | void;
  } };
}

const api = (): StorageApi | undefined => (globalThis as typeof globalThis & { chrome?: StorageApi }).chrome;

export async function savePulseStatus(status: PulseStatus): Promise<void> {
  try { await api()?.storage?.local?.set({ [key]: status }); }
  catch { /* A page status write must never interrupt scanning. */ }
}

export async function loadPulseStatus(now = Date.now()): Promise<PulseStatus | null> {
  try {
    const value = (await api()?.storage?.local?.get(key))?.[key];
    if (!value || typeof value !== 'object') return null;
    const status = value as Partial<PulseStatus>;
    if (typeof status.onPulse !== 'boolean' || !Number.isSafeInteger(status.visibleRows) || !Number.isSafeInteger(status.matchedRows) || !Number.isSafeInteger(status.colouredRows)
      || typeof status.at !== 'number' || !Number.isFinite(status.at) || status.at > now + 60_000 || now - status.at > 90_000) return null;
    const coinImages = status.coinImages && typeof status.coinImages === 'object' && !Array.isArray(status.coinImages)
      ? Object.fromEntries(Object.entries(status.coinImages).filter(([mint, url]) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint) && typeof url === 'string' && /^https:\/\//i.test(url)).slice(0, 30))
      : undefined;
    const assessments = Array.isArray(status.assessments)
      ? status.assessments.filter((item): item is Assessment => Boolean(item && typeof item === 'object'
        && typeof (item as Assessment).token?.mint === 'string'
        && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test((item as Assessment).token.mint)
        && typeof (item as Assessment).expiresAt === 'number'
        && (item as Assessment).expiresAt >= now)).slice(0, 30)
      : undefined;
    return (coinImages || assessments ? { ...status, ...(coinImages ? { coinImages } : {}), ...(assessments ? { assessments } : {}) } : status) as PulseStatus;
  } catch { return null; }
}
