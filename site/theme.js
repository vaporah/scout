/*
  Colour theme: the saved choice, the system preference, and the toggle.

  Loaded blocking in <head> rather than deferred, because it has to settle the theme
  before the first paint. Deferred, a visitor who picked light on a dark system would
  see the dark theme flash and then swap.

  It is a separate file and not a few inline lines in <head> because the site's content
  security policy is `script-src 'self'`, which blocks inline scripts.

  Everything is wrapped: localStorage throws outright when storage is blocked, and the
  privacy policy must render regardless. If any of this fails the page still paints, just
  following the system preference.
*/
(() => {
  const html = document.documentElement;
  const KEY = 'scout.theme.v1';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const save = value => { try { localStorage.setItem(KEY, value); } catch { /* ignore */ } };

  // Mark that scripting works. Other rules key off this so nothing that needs JS is
  // ever shown as a dead control, and nothing is hidden from a visitor without it.
  html.classList.add('js');

  // Before first paint: honour a saved choice. With none, deliberately set nothing and
  // let the stylesheet follow the system preference.
  const saved = read();
  if (saved === 'light' || saved === 'dark') html.dataset.theme = saved;

  // What is actually showing right now.
  const current = () => (html.dataset.theme === 'light' || html.dataset.theme === 'dark')
    ? html.dataset.theme
    : (system.matches ? 'dark' : 'light');

  const start = () => {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;

    // Make the running theme explicit so the colours and the icon always agree.
    html.dataset.theme = current();
    const sync = () => {
      const dark = current() === 'dark';
      const label = dark ? 'Switch to light theme' : 'Switch to dark theme';
      toggle.setAttribute('aria-label', label);
      toggle.setAttribute('title', label);
      toggle.setAttribute('aria-pressed', String(dark));
    };
    sync();

    toggle.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      const commit = () => { save(next); html.dataset.theme = next; sync(); };

      // A circle opening from the button is far nicer than a flat cross-fade, but view
      // transitions are not everywhere, so this is a progressive enhancement and the
      // stylesheet's own colour transitions cover the rest.
      if (typeof document.startViewTransition !== 'function' || calm.matches) { commit(); return; }

      const box = toggle.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      // Radius to the furthest viewport corner, so the circle actually covers it.
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      html.style.setProperty('--scout-x', `${x}px`);
      html.style.setProperty('--scout-y', `${y}px`);
      html.style.setProperty('--scout-r', `${radius}px`);
      const transition = document.startViewTransition(commit);
      transition.finished.finally(() => {
        html.style.removeProperty('--scout-x');
        html.style.removeProperty('--scout-y');
        html.style.removeProperty('--scout-r');
      });
    });

    // Follow the system only while the visitor has not chosen for themselves.
    system.addEventListener('change', event => {
      if (read()) return;
      html.dataset.theme = event.matches ? 'dark' : 'light';
      sync();
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
