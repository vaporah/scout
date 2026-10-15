import { solFlowReading } from './poolLiquidity.js';
import type { Token } from './types.js';

/** Keep a compact five-minute SOL flow readout on a highlighted list card. */
export function setPulseRowFlow(row: HTMLElement, token: Token | null): void {
  const existing = row.querySelector(':scope > .scout-pulse-flow');
  const reading = token ? solFlowReading(token) : null;
  if (!reading?.exact || !token?.solFlow5m) {
    existing?.remove();
    return;
  }

  const chip = existing instanceof (row.ownerDocument.defaultView?.HTMLElement ?? HTMLElement)
    ? existing as HTMLElement
    : row.ownerDocument.createElement('span');
  const net = token.solFlow5m.netSol;
  chip.className = `scout-pulse-flow ${net > 0 ? 'is-positive' : net < 0 ? 'is-negative' : 'is-flat'}`;
  chip.textContent = `5m ${reading.short}`;
  chip.setAttribute('title', `Five-minute net SOL flow: ${reading.detail}`);
  if (!chip.parentElement) row.append(chip);
}
