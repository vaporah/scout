import { assessMintsMessage, type ScanResponse } from './messages.js';

interface ChromeRuntime {
  runtime?: {
    sendMessage: (message: unknown, callback: (response: ScanResponse | undefined) => void) => void;
    lastError?: { message?: string };
  };
}

const chromeRuntime = (globalThis as typeof globalThis & { chrome?: ChromeRuntime }).chrome;

/**
 * A hung service worker must never leave a caller waiting forever. MV3 tears the
 * worker down when it goes idle, and a `sendMessage` callback in flight at that
 * moment can simply never fire. Callers that guard on an "in flight" flag would
 * then never scan again for the life of the page, so every request is bounded.
 */
export const scanTimeoutMs = 12_000;

/**
 * Ask the service worker to score a bounded set of exact Solana mints.
 * Shared by every page content script so the message name cannot drift.
 * The timeout is overridable so a caller (or a test) can bound the wait itself.
 */
export function requestAssessments(mints: string[], timeoutMs = scanTimeoutMs): Promise<ScanResponse> {
  return new Promise((resolve, reject) => {
    const runtime = chromeRuntime?.runtime;
    if (!runtime?.sendMessage) {
      reject(new Error('Scout extension runtime unavailable'));
      return;
    }
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (run: () => void): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) clearTimeout(timer);
      run();
    };
    timer = setTimeout(() => finish(() => reject(new Error('Scout scan timed out'))), timeoutMs);
    // Do not hold a Node test process open on the timer.
    const handle = timer as unknown as { unref?: () => void };
    if (typeof handle.unref === 'function') handle.unref();
    runtime.sendMessage({ type: assessMintsMessage, mints }, (response) => {
      finish(() => {
        const error = runtime.lastError;
        if (error || !response) reject(new Error(error?.message ?? 'Scout scan failed'));
        else resolve(response);
      });
    });
  });
}
