import { defaults, validSettings } from './settings.js';
import type { Assessment, Settings } from './types.js';

const key = 'scout.settings.v1';
const providerKey = 'scout.provider.v1';
export type ProviderMode = 'live';
type ExtensionStorage = { storage?: { local?: { set(items: Record<string, unknown>): Promise<void> | void } } };
const extensionApi = (globalThis as typeof globalThis & { chrome?: ExtensionStorage }).chrome;
const mirrorSettings = (settings: Settings): void => {
  try {
    const write = extensionApi?.storage?.local?.set({ [key]: settings });
    if (write && typeof write === 'object' && 'catch' in write) void write.catch(() => {});
  } catch { /* The companion still uses its saved local settings. */ }
};
export function loadProviderMode(): ProviderMode {
  // Older builds could leave Demo selected. The product now opens live only.
  localStorage.removeItem(providerKey);
  return 'live';
}
export function loadSettings(): Settings {
  try {
    const saved = localStorage.getItem(key);
    const settings = validSettings(JSON.parse(saved ?? 'null'));
    if (saved !== null) mirrorSettings(settings);
    return settings;
  }
  catch { return defaults; }
}
export function saveSettings(settings: Settings): void {
  const validated = validSettings(settings);
  localStorage.setItem(key, JSON.stringify(validated));
  mirrorSettings(validated);
}
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

/**
 * A token logo is untrusted third-party data: only a plain https image URL is
 * accepted, so no data:, file: or script URL can ever reach an <img> tag. Returns
 * null when the URL is missing or implausible, and the caller falls back to the
 * tinted initial avatar.
 */
export function safeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 400) return null;
  let url: URL;
  try { url = new URL(trimmed); }
  catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname)) return null;
  if (url.pathname.length > 300) return null;
  return url.toString();
}

/** Show the tinted initial again when a third-party logo fails to load. */
export function bindCoinImages(root: ParentNode): void {
  for (const image of Array.from(root.querySelectorAll<HTMLImageElement>('img.coin-img')))
    image.addEventListener('error', () => image.remove(), { once: true });
}

function fallbackCopy(text: string): boolean {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const copied = typeof document.execCommand === 'function' ? document.execCommand('copy') : false;
    area.remove();
    return copied;
  } catch { return false; }
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { return fallbackCopy(text); }
}

/**
 * Wire every "copy contract address" button. The mint is read from the button's own
 * data attribute, the click never bubbles into a row selection, and the button
 * reports success or failure in place without leaving a pending timer behind.
 */
export function bindCopyButtons(root: ParentNode): void {
  for (const button of Array.from(root.querySelectorAll<HTMLElement>('[data-copy-mint]'))) {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const mint = button.dataset.copyMint ?? '';
      void copyText(mint).then(copied => {
        const original = button.textContent ?? '';
        button.textContent = copied ? '✓ copied' : 'copy failed';
        button.classList.toggle('is-copied', copied);
        button.setAttribute('aria-label', copied ? 'Contract address copied' : 'Could not copy the contract address');
        const reset = setTimeout(() => {
          button.textContent = original;
          button.classList.remove('is-copied');
          button.setAttribute('aria-label', 'Copy contract address');
        }, 1400);
        const handle = reset as unknown as { unref?: () => void };
        if (typeof handle.unref === 'function') handle.unref();
      });
    });
  }
}
export function money(value: number | null, digits = 0): string {
  return value === null || !Number.isFinite(value) ? 'Unknown' : '$' + value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
export function pct(value: number | null, digits = 1): string {
  return value === null || !Number.isFinite(value) ? 'Unknown' : `${value.toFixed(digits)}%`;
}
export function age(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export function statusClass(status: Assessment['status']): string {
  return status === 'TOP CANDIDATE' ? 'candidate' : status === 'WATCH' ? 'watch' : status === 'HIGH RISK' || status === 'DISQUALIFIED' ? 'risk' : 'wait';
}
const shortStatuses: Record<Assessment['status'], string> = {
  'TOP CANDIDATE': 'TOP',
  'WATCH': 'WATCH',
  'WAIT FOR CONFIRMATION': 'WAIT',
  'HIGH RISK': 'RISK',
  'DISQUALIFIED': 'DISQ',
  'UNKNOWN / INCOMPLETE': 'UNKNOWN'
};
/** Compact status label for tight spaces; the full status stays in the title. */
export function statusShort(status: Assessment['status']): string {
  return shortStatuses[status] ?? status;
}
/**
 * Scout is actively warning about this coin: a critical finding, a high-risk
 * verdict, or a sharp drop in the last five minutes.
 */
export function hasCriticalFlag(a: Assessment): boolean {
  return a.critical.length > 0 || a.status === 'HIGH RISK' || (a.token.priceChange5mPct ?? 0) <= -25;
}

/**
 * Caution raised by the user's own thresholds rather than by the coin: a pool
 * thinner than the configured minimum, or an entry impact above the limit.
 */
export function hasEntryCaution(a: Assessment, settings: Settings): boolean {
  return a.token.liquidityUsd !== null && a.token.liquidityUsd < settings.minLiquidityUsd
    || a.slippagePct !== null && a.slippagePct > settings.maxSlippagePct;
}

export function signalClass(a: Assessment, settings: Settings): string {
  if (hasCriticalFlag(a)) return 'signal-red';
  if (hasEntryCaution(a, settings)) return 'signal-amber';
  if (a.status === 'TOP CANDIDATE') return 'signal-green';
  if (a.status === 'WATCH') return 'signal-amber';
  return 'signal-gray';
}

const renderSignatures = new WeakMap<Element, string>();

/**
 * Replace a panel's contents only when the content signature changed. Repeated
 * refreshes that produce identical content leave the live DOM alone, so polling
 * popups never flicker, never lose scroll position or an open section, and never
 * restart their entry animation.
 */
export function renderIfChanged(container: HTMLElement, signature: string, build: () => Node): void {
  if (renderSignatures.get(container) === signature && container.firstElementChild) return;
  const scrollTop = container.scrollTop;
  container.replaceChildren(build());
  renderSignatures.set(container, signature);
  if (scrollTop > 0) container.scrollTop = scrollTop;
}
