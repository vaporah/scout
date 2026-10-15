import type { Assessment, SignalRecord } from './types.js';

type Mode = 'live' | 'demo';
const currentKey = (mode: Mode) => `scout.current.${mode}.v1`;
const historyKey = (mode: Mode) => `scout.history.${mode}.v1`;

function read(key: string): SignalRecord[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is SignalRecord => item && typeof item === 'object' && typeof item.mint === 'string' && Number.isFinite(item.expiresAt)) : [];
  } catch { return []; }
}

export function loadCurrentSignals(mode: Mode, now = Date.now()): SignalRecord[] {
  return read(currentKey(mode)).filter(record => record.expiresAt >= now);
}

export function loadSignalHistory(mode: Mode, mint?: string): SignalRecord[] {
  const records = read(historyKey(mode));
  return mint ? records.filter(record => record.mint === mint) : records;
}

export function saveSignals(mode: Mode, assessments: Assessment[], now = Date.now()): void {
  const previous = new Map(read(currentKey(mode)).map(record => [record.mint, record]));
  const current: SignalRecord[] = assessments.map(a => ({
    mint: a.token.mint, symbol: a.token.symbol, at: now, observedAt: a.token.observedAt,
    expiresAt: a.expiresAt, status: a.status, score: a.score, dataCompletenessPct: a.dataCompletenessPct,
    priceUsd: a.token.priceUsd, liquidityUsd: a.token.liquidityUsd,
    reasons: [...a.critical, ...a.warnings, ...a.missing].slice(0, 12), provider: a.token.provider
  }));
  const changes = current.filter(record => previous.get(record.mint)?.status !== record.status);
  try {
    localStorage.setItem(currentKey(mode), JSON.stringify(current));
    if (changes.length) localStorage.setItem(historyKey(mode), JSON.stringify([...read(historyKey(mode)), ...changes].slice(-200)));
  } catch { /* Storage failure must not block current analysis. */ }
}
