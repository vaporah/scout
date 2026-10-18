/**
 * Resolve a packaged extension asset to a URL the host page can actually load.
 *
 * Content scripts share the page's origin, so a bare `scout-raccoon-logo.png`
 * would be requested from axiom.trade and 404. `chrome.runtime.getURL` returns
 * the `chrome-extension://` URL instead, which works as long as the file is
 * listed in the manifest's `web_accessible_resources`.
 */
export function assetUrl(file: string): string {
  const api = (globalThis as typeof globalThis & {
    chrome?: { runtime?: { getURL?: (path: string) => string } };
  }).chrome;
  const getURL = api?.runtime?.getURL;
  if (typeof getURL === 'function') {
    try {
      return getURL.call(api?.runtime, file);
    } catch {
      // Not running in an extension context (for example a jsdom test): fall back.
    }
  }
  return file;
}

/** The Scout mascot used as the verdict badge artwork. */
export const scoutMarkFile = 'scout-raccoon-logo.png';

/**
 * Vector stand-in for the mascot: a raccoon mask drawn as inline DOM rather than as
 * a loaded resource. A page Content-Security-Policy that forbids `chrome-extension:`
 * or `data:` images can stop the real logo from rendering, and a broken-image box in
 * the header looks like a bug rather than a policy. Inline SVG is not a subresource,
 * so no `img-src` directive can block it.
 */
const markFallback = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">'
  + '<circle cx="12" cy="12.6" r="10.4" fill="#15121c"/>'
  + '<path d="M5.4 6.4 3.6 2.4l4.6 1.8z" fill="#e9ebf0"/>'
  + '<path d="M18.6 6.4 20.4 2.4l-4.6 1.8z" fill="#e9ebf0"/>'
  + '<ellipse cx="8.5" cy="11.4" rx="3.2" ry="2.7" fill="#e9ebf0"/>'
  + '<ellipse cx="15.5" cy="11.4" rx="3.2" ry="2.7" fill="#e9ebf0"/>'
  + '<circle cx="8.7" cy="11.4" r="1.2" fill="#15121c"/>'
  + '<circle cx="15.3" cy="11.4" r="1.2" fill="#15121c"/>'
  + '<path d="M12 15.2c1.4 0 2.3.85 2.3 1.75S13.4 18.7 12 18.7s-2.3-.85-2.3-1.75S10.6 15.2 12 15.2z" fill="#e9ebf0"/>'
  + '</svg>';

/** Build the circular Scout mascot badge used by every coin popup. */
export function scoutMark(document: Document, className: string): HTMLElement {
  const badge = document.createElement('span');
  badge.className = className;
  badge.setAttribute('aria-hidden', 'true');
  const image = document.createElement('img');
  image.className = `${className}-img`;
  image.alt = '';
  image.decoding = 'async';
  // Listen before setting src, so an immediate failure is still caught.
  image.addEventListener('error', () => {
    image.remove();
    const fallback = document.createElement('span');
    fallback.className = `${className}-fallback`;
    // Constant markup, no interpolation: nothing here can come from the page.
    fallback.innerHTML = markFallback;
    badge.append(fallback);
  }, { once: true });
  image.src = assetUrl(scoutMarkFile);
  badge.append(image);
  return badge;
}
