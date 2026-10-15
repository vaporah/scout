export interface OverlayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const key = 'scout.overlays.v1';

interface StorageApi {
  storage?: { local?: {
    get(key: string): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void> | void;
  } };
}

const api = (): StorageApi | undefined => (globalThis as typeof globalThis & { chrome?: StorageApi }).chrome;

const isRect = (value: unknown): value is OverlayRect => {
  if (!value || typeof value !== 'object') return false;
  const rect = value as Partial<OverlayRect>;
  return Number.isFinite(rect.left) && Number.isFinite(rect.top) && Number.isFinite(rect.width) && Number.isFinite(rect.height);
};

/** Saved position/size for each movable popup, keyed by name. */
export async function loadOverlayRects(): Promise<Record<string, OverlayRect>> {
  try {
    const value = (await api()?.storage?.local?.get(key))?.[key];
    if (!value || typeof value !== 'object') return {};
    const out: Record<string, OverlayRect> = {};
    for (const [name, rect] of Object.entries(value as Record<string, unknown>)) {
      if (isRect(rect)) out[name] = rect;
    }
    return out;
  } catch { return {}; }
}

export async function saveOverlayRect(name: string, rect: OverlayRect): Promise<void> {
  try {
    const current = await loadOverlayRects();
    current[name] = rect;
    await api()?.storage?.local?.set({ [key]: current });
  } catch { /* prefs are best-effort and must never block the page */ }
}

const flagKey = 'scout.overlayFlags.v1';

/** Remembered popup switches (short mode, collapsed), keyed by name. */
export async function loadOverlayFlags(): Promise<Record<string, boolean>> {
  try {
    const value = (await api()?.storage?.local?.get(flagKey))?.[flagKey];
    if (!value || typeof value !== 'object') return {};
    const out: Record<string, boolean> = {};
    for (const [name, flag] of Object.entries(value as Record<string, unknown>)) {
      if (typeof flag === 'boolean') out[name] = flag;
    }
    return out;
  } catch { return {}; }
}

export async function saveOverlayFlag(name: string, value: boolean): Promise<void> {
  try {
    const current = await loadOverlayFlags();
    current[name] = value;
    await api()?.storage?.local?.set({ [flagKey]: current });
  } catch { /* prefs are best-effort and must never block the page */ }
}
