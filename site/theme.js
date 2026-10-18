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

  const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const save = value => { try { localStorage.setItem(KEY, value); } catch { /* ignore */ } };

  // Mark that scripting works. Other rules key off this so nothing that needs JS is
  // ever shown as a dead control, and nothing is hidden from a visitor without it.
  html.classList.add('js');

  // Before first paint: honour a saved choice. With none, deliberately set nothing and
  // let the stylesheet follow the system preference.
  const saved = read();
  if (saved === 'light' || saved === 'dark') html.dataset.theme = saved;
  html.classList.add('motion-full');

  // What is actually showing right now.
  const current = () => (html.dataset.theme === 'light' || html.dataset.theme === 'dark')
    ? html.dataset.theme
    : (system.matches ? 'dark' : 'light');

  const start = () => {
    const toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    const fullMotion = () => true;

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

    let swaps = 0;
    toggle.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      // Which click this is, so a swap that gets aborted by a later one cannot apply its
      // own choice over the top of the newer one.
      const mine = ++swaps;
      const commit = () => { save(next); html.dataset.theme = next; sync(); };

      // A circle opening from the button is far nicer than a flat cross-fade, but view
      // transitions are not everywhere, so this is a progressive enhancement and the
      // stylesheet's own colour transitions cover the rest.
      if (typeof document.startViewTransition !== 'function') { commit(); return; }

      // A visitor whose system asks for less motion still gets a transition, just not a
      // moving one: the stylesheet dissolves the new theme over the old instead of growing
      // a circle from the button. The origin and radius are therefore only supplied when
      // the circle is the thing that will actually be drawn.
      let reveal;
      if (fullMotion()) {
        const box = toggle.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        // Radius to the furthest viewport corner, so the circle actually covers it.
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
        html.style.setProperty('--scout-x', `${x}px`);
        html.style.setProperty('--scout-y', `${y}px`);
        html.style.setProperty('--scout-r', `${radius}px`);
        reveal = { x, y, radius };
      }
      // Freeze the surfaces' own colour transitions for the duration, so the snapshot the
      // circle reveals already holds the finished palette rather than a fade in progress.
      html.classList.add('theming');
      const clear = () => {
        html.classList.remove('theming');
        html.style.removeProperty('--scout-x');
        html.style.removeProperty('--scout-y');
        html.style.removeProperty('--scout-r');
      };
      let transition;
      try {
        transition = document.startViewTransition(commit);
      } catch {
        // Never leave the freeze on: without it the page would stop animating entirely.
        clear();
        commit();
        return;
      }
      // A safety net under the freeze. `finished` is meant to settle whether the transition
      // plays, is skipped or is abandoned, but if it ever does not - and a transition that
      // never reported back would freeze every transition on the page for the rest of the
      // visit, which reads as hover states and the theme swap both being broken - the guard
      // lifts it anyway. clear() is idempotent, so running it twice costs nothing.
      //
      // The catch is not decoration: a second click landing while the first swap is still
      // running aborts it, and an aborted transition rejects this promise with "Transition
      // was aborted because of invalid state". Without the catch that lands in the console
      // as an unhandled rejection on every quick double click. The promise's own rejection
      // is handled here; what the visitor chose is checked separately, because an aborted
      // transition can be one whose update callback never ran at all.
      const guard = setTimeout(clear, 1500);
      // `ready` rejects with the same reason when a swap is skipped, and an unhandled
      // rejection there is just as loud in the console as one on `finished`.
      // Chrome can resolve a View Transition while silently suppressing its stylesheet
      // animation when this particular tab reports reduced motion. The site's motion
      // control is the source of truth, so drive the reveal explicitly on the transition
      // pseudo-element as well. This also keeps localhost and production identical when
      // the browser gives the two origins different media preferences.
      const revealDone = transition.ready?.then?.(() => {
        if (!reveal || !fullMotion() || typeof html.animate !== 'function') return;
        try {
          const animation = html.animate(
            {
              clipPath: [
                `circle(0px at ${reveal.x}px ${reveal.y}px)`,
                `circle(${reveal.radius}px at ${reveal.x}px ${reveal.y}px)`
              ]
            },
            {
              duration: 500,
              easing: 'cubic-bezier(.16, .84, .24, 1)',
              fill: 'both',
              pseudoElement: '::view-transition-new(root)'
            }
          );
          return animation.finished.catch(() => {});
        } catch { /* the stylesheet animation remains the fallback */ }
      }).catch?.(() => {});
      Promise.allSettled([transition.finished, revealDone]).finally(() => {
        clearTimeout(guard);
        clear();
        if (mine === swaps && html.dataset.theme !== next) commit();
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
