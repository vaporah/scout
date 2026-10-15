import type { AthInfo } from './ath.js';
import type { Assessment, Settings } from './types.js';
import type { VampPool } from './vamps.js';

/** Single message contract between page content scripts and the service worker. */
export const assessMintsMessage = 'SCOUT_ASSESS_MINTS';

export interface ScanResponse {
  assessments: Assessment[];
  settings?: Settings;
  errors?: string[];
  /** All-time high for a single-mint (token page) request, when available. */
  ath?: AthInfo | null;
  /** Other Solana mints trading under the same ticker (single-mint requests only). */
  vamps?: VampPool[];
}
