const key = 'scout.pulseStatus.v1';

export interface PulseStatus {
  onPulse: boolean;
  visibleRows: number;
  matchedRows: number;
  colouredRows: number;
  at: number;
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
    return status as PulseStatus;
  } catch { return null; }
}
