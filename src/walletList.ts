import { mintPattern } from './dex.js';

export const walletListStorageKey = 'scout.wallets.v1';
export const maxWallets = 5_000;

export interface TrackedWallet {
  address: string;
  name: string;
  emoji: string;
  developer: boolean;
  alertsOnToast: boolean;
  alertsOnBubble: boolean;
  alertsOnFeed: boolean;
}

interface WalletExportEntry {
  trackedWalletAddress?: unknown;
  name?: unknown;
  emoji?: unknown;
  alertsOnToast?: unknown;
  alertsOnBubble?: unknown;
  alertsOnFeed?: unknown;
}

const text = (value: unknown, max: number): string => typeof value === 'string' ? value.trim().slice(0, max) : '';

/** Parse an Axiom wallet export into one flat, address-keyed list. */
export function parseWalletList(input: unknown): TrackedWallet[] {
  if (!Array.isArray(input)) return [];
  const wallets = new Map<string, TrackedWallet>();
  for (const raw of input.slice(0, maxWallets)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as WalletExportEntry;
    const address = text(item.trackedWalletAddress, 44);
    if (!mintPattern.test(address) || wallets.has(address)) continue;
    const name = text(item.name, 80) || `${address.slice(0, 5)}…${address.slice(-4)}`;
    wallets.set(address, {
      address,
      name,
      emoji: text(item.emoji, 16),
      developer: /(^|\W)dev(?:eloper)?(\W|$)/i.test(name),
      alertsOnToast: item.alertsOnToast === true,
      alertsOnBubble: item.alertsOnBubble === true,
      alertsOnFeed: item.alertsOnFeed === true
    });
  }
  return [...wallets.values()];
}

interface StorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

function storage(): StorageArea | undefined {
  return (globalThis as typeof globalThis & { chrome?: { storage?: { local?: StorageArea } } }).chrome?.storage?.local;
}

export async function loadWalletList(): Promise<TrackedWallet[]> {
  try {
    const value = (await storage()?.get(walletListStorageKey))?.[walletListStorageKey];
    if (!Array.isArray(value)) return [];
    return value.filter((wallet): wallet is TrackedWallet => !!wallet && typeof wallet === 'object'
      && mintPattern.test((wallet as TrackedWallet).address) && typeof (wallet as TrackedWallet).name === 'string');
  } catch { return []; }
}

export async function saveWalletList(wallets: TrackedWallet[]): Promise<void> {
  await storage()?.set({ [walletListStorageKey]: wallets.slice(0, maxWallets) });
}

export async function clearWalletList(): Promise<void> {
  await storage()?.remove(walletListStorageKey);
}

/** Portable flat export. It can be pasted back into Scout or Axiom-style importers. */
export function exportWalletList(wallets: TrackedWallet[]): string {
  return JSON.stringify(wallets.map(wallet => ({
    trackedWalletAddress: wallet.address,
    name: wallet.name,
    emoji: wallet.emoji,
    alertsOnToast: wallet.alertsOnToast,
    alertsOnBubble: wallet.alertsOnBubble,
    alertsOnFeed: wallet.alertsOnFeed
  })), null, 2);
}
