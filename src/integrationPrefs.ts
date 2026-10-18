export const integrationPrefsKey = 'scout.integrations.v1';

export interface IntegrationPrefs {
  coinPopups: boolean;
  rowHighlights: boolean;
}

export const defaultIntegrationPrefs: IntegrationPrefs = {
  coinPopups: true,
  rowHighlights: true
};

interface StorageChanges { [key: string]: { newValue?: unknown } }
interface ChromeStorage {
  storage?: {
    local?: {
      get(key: string): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void> | void;
    };
    onChanged?: {
      addListener(listener: (changes: StorageChanges, area: string) => void): void;
      removeListener(listener: (changes: StorageChanges, area: string) => void): void;
    };
  };
}

const api = (): ChromeStorage | undefined => (globalThis as typeof globalThis & { chrome?: ChromeStorage }).chrome;

export function validIntegrationPrefs(value: unknown): IntegrationPrefs {
  const input = value && typeof value === 'object' ? value as Partial<IntegrationPrefs> : {};
  return {
    coinPopups: typeof input.coinPopups === 'boolean' ? input.coinPopups : true,
    rowHighlights: typeof input.rowHighlights === 'boolean' ? input.rowHighlights : true
  };
}

export async function loadIntegrationPrefs(): Promise<IntegrationPrefs> {
  try { return validIntegrationPrefs((await api()?.storage?.local?.get(integrationPrefsKey))?.[integrationPrefsKey]); }
  catch { return defaultIntegrationPrefs; }
}

export async function saveIntegrationPrefs(prefs: IntegrationPrefs): Promise<void> {
  await api()?.storage?.local?.set({ [integrationPrefsKey]: validIntegrationPrefs(prefs) });
}

export function watchIntegrationPrefs(onChange: (prefs: IntegrationPrefs) => void): () => void {
  const changed = api()?.storage?.onChanged;
  if (!changed) return () => {};
  const listener = (changes: StorageChanges, area: string): void => {
    if (area === 'local' && integrationPrefsKey in changes) onChange(validIntegrationPrefs(changes[integrationPrefsKey]?.newValue));
  };
  changed.addListener(listener);
  return () => changed.removeListener(listener);
}
