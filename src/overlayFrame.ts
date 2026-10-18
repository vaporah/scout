import type { OverlayRect } from './overlayPrefs.js';

export interface OverlayFrameOptions {
  document?: Document;
  /** Element the user drags to move the popup. */
  handle: HTMLElement;
  /** Element the user drags to resize the popup. */
  resize?: HTMLElement;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** What the resize handle changes. Popups use "width" so content can still grow downwards. */
  resizeAxis?: 'both' | 'width';
  /** Return true to stop a move that started on this descendant of the handle. */
  isBlocked?: (target: Element) => boolean;
  /** Called on mouseup with the final position and size. */
  onCommit?: (rect: OverlayRect) => void;
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

/**
 * Restore a saved position and size onto a floating element. Height is only applied
 * when the caller asks for it: a remembered height would otherwise clip a popup that
 * later grows (an expanded section or a longer list).
 */
export function applyOverlayRect(element: HTMLElement, rect: OverlayRect, options: { height?: boolean } = {}): void {
  const view = element.ownerDocument.defaultView;
  const viewportWidth = view?.innerWidth ?? 1024;
  const viewportHeight = view?.innerHeight ?? 768;
  const width = clamp(rect.width, 220, Math.max(220, viewportWidth - 24));
  const height = clamp(rect.height, 130, Math.max(130, viewportHeight - 24));
  // A panel saved on another monitor or at another zoom level must always return
  // fully on-screen. Keeping only a tiny drag handle visible was too easy to miss.
  const left = clamp(rect.left, 0, Math.max(0, viewportWidth - width - 12));
  const top = clamp(rect.top, 0, Math.max(0, viewportHeight - Math.min(height, 48) - 12));
  element.style.right = 'auto';
  element.style.bottom = 'auto';
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  element.style.width = `${width}px`;
  if (options.height === false) element.style.height = '';
  else element.style.height = `${height}px`;
}

/**
 * Make a floating popup movable (drag the handle) and resizable (drag the
 * corner). Works for any element; the caller supplies the handles and saves the
 * committed rect. Returns a detach function.
 */
export function attachOverlayFrame(element: HTMLElement, options: OverlayFrameOptions): () => void {
  const doc = options.document ?? element.ownerDocument;
  const minWidth = options.minWidth ?? 220;
  const minHeight = options.minHeight ?? 130;
  const maxWidth = options.maxWidth ?? 720;
  const maxHeight = options.maxHeight ?? 760;
  type DragState = { mode: 'move' | 'resize'; startX: number; startY: number; left: number; top: number; width: number; height: number };
  let drag: DragState | null = null;

  function start(event: MouseEvent, mode: 'move' | 'resize'): void {
    if (event.button !== 0) return;
    const target = event.target as Element | null;
    if (mode === 'move' && options.isBlocked && target && typeof target.closest === 'function' && options.isBlocked(target)) return;
    const rect = element.getBoundingClientRect();
    drag = { mode, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    element.style.right = 'auto';
    element.style.bottom = 'auto';
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    if (mode === 'resize') {
      element.style.width = `${rect.width}px`;
      if (options.resizeAxis !== 'width') element.style.height = `${rect.height}px`;
    }
    event.preventDefault();
  }

  function move(event: MouseEvent): void {
    if (!drag) return;
    const view = doc.defaultView;
    const viewW = view?.innerWidth ?? 1024;
    const viewH = view?.innerHeight ?? 768;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.mode === 'move') {
      element.style.left = `${clamp(drag.left + dx, 0, Math.max(0, viewW - 48))}px`;
      element.style.top = `${clamp(drag.top + dy, 0, Math.max(0, viewH - 28))}px`;
    } else {
      const availableWidth = Math.max(minWidth, viewW - drag.left - 12);
      const availableHeight = Math.max(minHeight, viewH - drag.top - 12);
      element.style.width = `${clamp(drag.width + dx, minWidth, Math.min(maxWidth, availableWidth))}px`;
      if (options.resizeAxis !== 'width') element.style.height = `${clamp(drag.height + dy, minHeight, Math.min(maxHeight, availableHeight))}px`;
    }
  }

  function end(): void {
    if (!drag) return;
    drag = null;
    const rect = element.getBoundingClientRect();
    options.onCommit?.({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  }

  const onHandleDown = (event: Event): void => start(event as MouseEvent, 'move');
  const onResizeDown = (event: Event): void => start(event as MouseEvent, 'resize');
  options.handle.addEventListener('mousedown', onHandleDown);
  options.resize?.addEventListener('mousedown', onResizeDown);
  doc.addEventListener('mousemove', move);
  doc.addEventListener('mouseup', end);

  return () => {
    options.handle.removeEventListener('mousedown', onHandleDown);
    options.resize?.removeEventListener('mousedown', onResizeDown);
    doc.removeEventListener('mousemove', move);
    doc.removeEventListener('mouseup', end);
  };
}
