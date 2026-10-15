/** Classification and supporting lines read from Axiom's token-page dev badge. */
export interface AxiomDevBadge {
  classification: string;
  tone: 'green' | 'red' | 'neutral';
  details: string[];
}

const devLabel = /^(PROVEN|FARMER|GOOD|SOLID|SAFE|UNKNOWN)\s+DEV$/i;

const toneFor = (label: string): AxiomDevBadge['tone'] => {
  const word = label.toUpperCase();
  if (word === 'FARMER') return 'red';
  if (word === 'UNKNOWN') return 'neutral';
  return 'green';
};

/**
 * Parse a dev provenance label plus its supporting lines. Only a recognised
 * "<WORD> DEV" heading is accepted; everything else is ignored.
 */
export function parseAxiomDevBadge(text: string): AxiomDevBadge | null {
  const match = String(text ?? '').trim().match(devLabel);
  const label = match?.[1];
  if (!match || !label) return null;
  return { classification: label.toUpperCase() + ' DEV', tone: toneFor(label), details: [] };
}

const scoutUi = '.scout-risk, .scout-dev, .scout-pulse-badge, .scout-pulse-tooltip';

/**
 * Find Axiom's dev provenance badge on a token page, excluding Scout's own
 * injected UI. The badge is the small element whose own text is a recognised
 * dev classification; its sibling lines become the evidence details.
 */
export function extractAxiomDevBadge(doc: Document): AxiomDevBadge | null {
  const root = doc.body;
  if (!root) return null;
  let labelElement: HTMLElement | null = null;
  let labelLength = Number.POSITIVE_INFINITY;
  for (const element of Array.from(root.querySelectorAll<HTMLElement>('div, section, span, p, strong, li, h1, h2, h3'))) {
    if (element.closest(scoutUi)) continue;
    const text = (element.textContent ?? '').trim();
    if (!text || text.length > 60) continue;
    if (!parseAxiomDevBadge(text)) continue;
    if (text.length < labelLength) {
      labelElement = element;
      labelLength = text.length;
    }
  }
  if (!labelElement) return null;
  const badge = parseAxiomDevBadge(labelElement.textContent ?? '');
  if (!badge) return null;

  // Walk up a few levels to find the container that holds the details.
  let container = labelElement.parentElement;
  let lines: string[] = [];
  for (let depth = 0; depth < 4 && container; depth++) {
    lines = siblingLines(container, labelElement, badge.classification);
    if (lines.length) break;
    container = container.parentElement;
  }
  badge.details = lines;
  return badge;
}

function siblingLines(container: Element, labelElement: Element, classification: string): string[] {
  const lines: string[] = [];
  for (const child of Array.from(container.children)) {
    if (child === labelElement || child.contains(labelElement)) continue;
    const text = (child.textContent ?? '').trim();
    if (!text || text === classification) continue;
    if (text.length >= 3 && text.length <= 200) lines.push(text);
  }
  return lines.slice(0, 4);
}
