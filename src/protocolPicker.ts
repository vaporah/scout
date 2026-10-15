import { escapeHtml as e } from './ui.js';
import type { PlatformOption } from './platformFilter.js';

/**
 * The shared pill picker behind every "filter by" row: launchpads and quote
 * tokens. A card of toggle pills, one per option, with a bulk action and an
 * optional "show more" expander, the same idea as the Axiom protocol picker.
 * An empty selection means "every option", so something new is never hidden by a
 * filter the user set earlier.
 *
 * Two of these can sit on the same page, so the element ids, the pill data
 * attribute and the bulk-action wording are all parameterised per picker.
 */

export const selectAllId = 'select-all-platforms';
export const showMoreId = 'toggle-platforms';
export const quoteSelectAllId = 'select-all-quotes';
export const quoteShowMoreId = 'toggle-quotes';
/** Pills shown before the "show more" expander.
 * Kept low enough to stay tidy: 12 pills, then the rest behind the expander. */
export const visibleLimit = 12;

export interface PickerIds {
  selectAll: string;
  showMore: string;
}

export const platformPickerIds: PickerIds = { selectAll: selectAllId, showMore: showMoreId };
export const quotePickerIds: PickerIds = { selectAll: quoteSelectAllId, showMore: quoteShowMoreId };

export interface ProtocolPickerOptions {
  items: PlatformOption[];
  /** Selected ids; an empty list means everything is shown. */
  selected: string[];
  expanded: boolean;
  /** Popup variant: narrower columns. */
  compact?: boolean;
  /** Denser row for short, fixed lists such as quote tokens. */
  dense?: boolean;
  heading?: string;
  /** Override when more than one picker can appear on the page. */
  ids?: PickerIds;
  /** Hide the "show more" expander for a fixed, short list. */
  expander?: boolean;
  /** Wording for the "everything is shown" bulk state; defaults to launchpads. */
  allLabel?: string;
  /** Data attribute the caller reads back on click. */
  dataAttribute?: string;
}

/** Mark when the option has one, otherwise a letter monogram so a brand-new
 * option still gets a readable chip on the day it appears. */
function icon(item: PlatformOption): string {
  if (item.mark) return `<span class="protocol-icon" aria-hidden="true">${item.mark}</span>`;
  const letter = item.label.replace(/[^a-z0-9]/gi, '').slice(0, 1).toUpperCase() || '?';
  return `<span class="protocol-icon protocol-icon--letter" aria-hidden="true">${e(letter)}</span>`;
}

export function protocolPicker(options: ProtocolPickerOptions): string {
  const items = options.items;
  if (!items.length) return '';
  const ids = options.ids ?? platformPickerIds;
  const attribute = options.dataAttribute ?? 'data-platform';
  const expander = options.expander ?? true;
  const allLabel = options.allLabel ?? 'launchpads';
  const showingAll = options.selected.length === 0;
  const visible = expander && !options.expanded ? items.slice(0, visibleLimit) : items;
  const hidden = items.length - visible.length;
  const pill = (item: PlatformOption): string => {
    const on = showingAll || options.selected.includes(item.id);
    const idle = item.count === 0 ? ' is-idle' : '';
    const coins = `${item.count} coin${item.count === 1 ? '' : 's'} in this scan`;
    // A zero is left blank rather than printed: the dimmed pill and the tooltip
    // already say "nothing here right now", and 25 zeroes would just be noise.
    const count = item.count === 0 ? '' : `<span class="protocol-count">${item.count}</span>`;
    return `<button type="button" class="protocol-pill ${on ? 'is-on' : ''}${idle}" ${attribute}="${e(item.id)}" style="--chip:${e(item.color)}" aria-pressed="${on}" title="${e(`${item.label}: ${coins}`)}">${icon(item)}<span class="protocol-name">${e(item.label)}</span>${count}</button>`;
  };
  const more = expander && (hidden > 0 || options.expanded)
    ? `<button type="button" class="protocols-more" id="${ids.showMore}" aria-expanded="${options.expanded}">${options.expanded ? 'Show less' : `Show more ${hidden}`}<span class="chev" aria-hidden="true">${options.expanded ? '\u25b4' : '\u25be'}</span></button>`
    : '';
  const bulk = `<button type="button" class="protocols-all" id="${ids.selectAll}" ${showingAll ? 'disabled' : ''}>${showingAll ? `All ${e(allLabel)} shown` : 'Select all'}</button>`;
  const classes = ['protocols'];
  if (options.compact) classes.push('protocols--compact');
  if (options.dense) classes.push('protocols--dense');

  return `<section class="${classes.join(' ')}">
    <div class="protocols-head"><h3 class="protocols-title">${e(options.heading ?? 'Launchpads')}</h3>${bulk}</div>
    <div class="protocols-card">
      <div class="protocols-grid">${visible.map(pill).join('')}</div>
      ${more}
    </div>
  </section>`;
}

export interface ProtocolPickerHandlers {
  /** Toggle one option; an empty id means "select all". */
  onToggle: (id: string) => void;
  /** Called when the expander is used; the caller flips its own state and re-renders. */
  onToggleMore: () => void;
}

export interface PickerBinding {
  dataAttribute?: string;
  ids?: PickerIds;
}

/** Wire the pills, the bulk action and the expander inside one rendered picker. */
export function bindProtocolPicker(root: ParentNode, handlers: ProtocolPickerHandlers, binding: PickerBinding = {}): void {
  const attribute = binding.dataAttribute ?? 'data-platform';
  const ids = binding.ids ?? platformPickerIds;
  for (const pill of Array.from(root.querySelectorAll<HTMLElement>(`[${attribute}]`)))
    pill.addEventListener('click', () => handlers.onToggle(pill.getAttribute(attribute) ?? ''));
  root.querySelector<HTMLElement>(`#${ids.selectAll}`)?.addEventListener('click', () => handlers.onToggle(''));
  root.querySelector<HTMLElement>(`#${ids.showMore}`)?.addEventListener('click', () => handlers.onToggleMore());
}
