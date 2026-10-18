/*
  Homepage behaviour: the release block, the live market panel, the scroll reveal, the
  nav's scrolled state and the narrow-screen menu. Loaded deferred, and every lookup
  tolerates its element being absent.

  The privacy page deliberately does not load this file.

  Note for anyone extending this: it used to be one flat block of statements with an
  early return in the middle for "release not published". Anything added below that
  return silently never ran. The release work now lives in its own function so the
  rest of the file cannot be switched off by it.
*/
(() => {
  // An open tab otherwise keeps the exact CSS and JavaScript it loaded before a
  // Cloudflare Pages deployment. Check a tiny cache-busted build marker while the tab is
  // in use, then reload once when a newer deployment is available.
  const loadedBuild = document.querySelector('meta[name="scout-build"]')?.content;
  const checkBuild = async () => {
    if (!loadedBuild || document.hidden) return;
    try {
      const response = await fetch(`/build.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const latest = await response.json();
      if (/^[a-f0-9]{10}$/.test(latest?.build) && latest.build !== loadedBuild) location.reload();
    } catch { /* The site stays usable when the version check is offline. */ }
  };
  const buildTimer = setInterval(checkBuild, 5 * 60 * 1000);
  window.addEventListener('pagehide', () => clearInterval(buildTimer), { once: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkBuild(); });

  const calm = { matches: false };
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  // The extension is public now; every route to the release section is an action,
  // not a status check. Keeping this here also covers cached markup during rollout.
  document.querySelectorAll('a[href="#download"]').forEach(link => { link.textContent = 'Download'; });
  document.querySelectorAll('.hero-proof span, .release-action small').forEach(label => {
    if (label.textContent?.includes('Axiom + GMGN')) label.textContent = label.textContent.replace('Axiom + GMGN', 'Axiom + GMGN + Padre');
  });

  /* --------------------------------------------------------------- Release */
  const applyRelease = () => {
    const config = window.SCOUT_RELEASE || {};
    const secureUrl = value => {
      try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
      } catch { return null; }
    };

    const sourceUrl = secureUrl(config.sourceUrl);
    if (config.sourcePublic === true && sourceUrl) {
      const source = document.getElementById('source-link');
      if (source) {
        source.href = sourceUrl;
        source.textContent = 'Explore the source on GitHub';
      }
      setText('source-description', 'Scout is open source under the MIT license. Research tools people can understand, question and improve together.');
    }

    const downloadUrl = secureUrl(config.downloadUrl);
    if (config.released !== true || !downloadUrl) return;
    const version = /^\d+\.\d+\.\d+$/.test(config.version || '') ? config.version : null;

    const button = document.getElementById('download-button');
    if (button) button.hidden = true;

    const link = document.getElementById('release-link');
    if (link) {
      link.href = downloadUrl;
      link.textContent = 'Add to Chrome';
      link.hidden = false;
    }

    setText('release-badge', version ? `Public release · v${version}` : 'Available on Chrome Web Store');
    setText('release-description', 'Scout is available on the Chrome Web Store. Add it to Chrome, then open Axiom, GMGN or Padre and carry on as usual.');
    setText('availability', version ? `Version ${version} available` : 'Available on Chrome Web Store');

    const heading = document.querySelector('.release h2');
    if (heading) heading.textContent = 'Your research edge is ready.';
  };
  try { applyRelease(); } catch { /* leave the shipped copy exactly as written */ }

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ------------------------------------------------ Live Solana meme coins */
  const marketUrl = 'https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?include=base_token&page=1';
  const liveRows = [...document.querySelectorAll('[data-live-row]')];
  const livePreview = document.getElementById('live-preview');
  let markets = [];
  let selectedMarket = 0;
  let marketRequest;

  const money = value => {
    if (!Number.isFinite(value)) return 'Not published';
    if (value >= 1) return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
    return `$${value.toLocaleString('en-US', { maximumSignificantDigits: 4 })}`;
  };
  const compactMoney = value => Number.isFinite(value)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value)
    : 'Not published';
  const percent = value => Number.isFinite(value) ? `${value >= 0 ? '+' : ''}${value.toFixed(1)}%` : 'Not published';

  // Trading screens shorten a mint the same way, so the shape is already familiar.
  const shortenMint = value => value.length > 13 ? `${value.slice(0, 5)}...${value.slice(-4)}` : value;

  const copyText = async value => {
    if (!value) return false;
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Clipboard permission can be unavailable in an embedded browser. Keep a synchronous
      // fallback for a direct user click without sending the mint anywhere.
      const field = document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      field.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch { /* leave false */ }
      field.remove();
      return copied;
    }
  };

  const copyMarketAddress = async (index, target, compact = false) => {
    const address = markets[index]?.address;
    if (!address || !target || !await copyText(address)) return;
    const original = compact ? shortenMint(address) : address;
    target.textContent = 'Copied';
    target.classList.add('is-copied');
    target.setAttribute('aria-label', `Copied ${address}`);
    setTimeout(() => {
      if (markets[index]?.address !== address) return;
      target.textContent = original;
      target.classList.remove('is-copied');
      target.setAttribute('aria-label', `Copy contract address ${address}`);
    }, 1100);
  };

  // The logo URL arrives inside data we did not write, so only https ever reaches an
  // <img>. The content security policy names the two hosts GeckoTerminal uses, which
  // means a link to anywhere else would not load even if it slipped through here.
  const safeImage = value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : '';
    } catch { return ''; }
  };
  const liveStatus = text => setText('live-status', text);
  const setLiveState = state => {
    if (!livePreview) return;
    livePreview.classList.toggle('is-live', state === 'live');
    livePreview.classList.toggle('is-error', state === 'error');
    livePreview.setAttribute('aria-busy', String(state === 'loading'));
    setText('live-mode', state === 'live' ? 'Live market' : state === 'error' ? 'Market feed unavailable' : 'Connecting');
  };

  const showMarket = index => {
    const coin = markets[index];
    if (!coin) return;
    selectedMarket = index;
    setText('demo-heading', `${coin.symbol.toUpperCase()} trending context.`);
    setText('demo-identity', 'GeckoTerminal trending pools');
    setText('demo-holders', compactMoney(coin.market_cap));
    setText('demo-developer', percent(coin.change_1h));
    setText('demo-controls', compactMoney(coin.volume_1h));
    setText('demo-contract', coin.address || 'Not published');
    const contract = document.getElementById('demo-contract');
    if (contract) {
      contract.disabled = !coin.address;
      contract.dataset.marketIndex = String(index);
      contract.setAttribute('aria-label', coin.address ? `Copy contract address ${coin.address}` : 'Contract address not published');
      contract.title = coin.address ? 'Copy contract address' : '';
    }
    setText('demo-note', 'Trending reflects current pool activity, not a trading signal. Verify every trade independently.');
    liveRows.forEach(row => {
      const selected = Number(row.dataset.liveRow) === index;
      row.classList.toggle('is-selected', selected);
      row.setAttribute('aria-pressed', String(selected));
    });
  };

  const renderMarkets = data => {
    markets = data;
    data.forEach((coin, index) => {
      const symbol = coin.symbol.toUpperCase();
      const row = liveRows[index];
      if (!row) return;
      // The avatar falls back to the ticker's first letter, so a token with no logo, or
      // one whose logo the network refuses, still reads as a labelled row. The letter sits
      // in its own element rather than in the box's own text, because text written into
      // the box is discarded along with the logo on every refresh of the feed, which built
      // a fresh image every minute and flickered letter over logo each time it reloaded.
      const avatar = document.getElementById(`live-coin-${index}`);
      if (avatar) {
        let letter = avatar.querySelector('.coin-letter');
        if (!letter) {
          letter = document.createElement('span');
          letter.className = 'coin-letter';
          avatar.textContent = '';
          avatar.append(letter);
        }
        letter.textContent = symbol.slice(0, 1);

        const existing = avatar.querySelector('img');
        if (!coin.image) {
          // No logo published. The letter is the row's identity, so leave it showing.
          if (existing) existing.remove();
          avatar.classList.remove('has-photo');
        } else if (!existing || existing.getAttribute('src') !== coin.image) {
          // Only rebuilt when the logo actually changes, so an unchanged row is left alone
          // rather than reloaded under the reader's eyes every time the feed ticks.
          if (existing) existing.remove();
          avatar.classList.remove('has-photo');
          const photo = document.createElement('img');
          photo.alt = '';
          photo.decoding = 'async';
          // Eager, unlike the rest of the page. There are three of these, they sit in the
          // first viewport, and deferred they arrive after the letter they are replacing.
          photo.loading = 'eager';
          photo.addEventListener('load', () => avatar.classList.add('has-photo'));
          photo.addEventListener('error', () => { photo.remove(); avatar.classList.remove('has-photo'); });
          photo.src = coin.image;
          avatar.append(photo);
        }
      }
      setText(`live-symbol-${index}`, symbol);
      const symbolEl = document.getElementById(`live-symbol-${index}`);
      if (symbolEl) {
        const name = document.createElement('small');
        name.textContent = coin.name;
        symbolEl.append(' ', name);
      }
      const change = Number(coin.change_1h);
      setText(`live-change-${index}`, `${percent(change)} · 1h`);
      // Short enough to sit on the row, with the whole mint on the tooltip and in the
      // selected-market panel below, where there is room to read it properly.
      const ca = document.getElementById(`live-ca-${index}`);
      if (ca) {
        ca.textContent = coin.address ? shortenMint(coin.address) : '';
        if (coin.address) {
          ca.title = `Copy ${coin.address}`;
          ca.setAttribute('aria-label', `Copy contract address ${coin.address}`);
        } else {
          ca.removeAttribute('title');
          ca.removeAttribute('aria-label');
        }
      }
      setText(`live-price-${index}`, money(Number(coin.current_price)));
      const price = document.getElementById(`live-price-${index}`);
      if (price) {
        const label = document.createElement('small');
        label.textContent = 'Price';
        price.append(label);
      }
      row.classList.toggle('row--gain', Number.isFinite(change) && change > 0);
      row.classList.toggle('row--loss', Number.isFinite(change) && change < 0);
    });
    showMarket(Math.min(selectedMarket, data.length - 1));
    setLiveState('live');
    liveStatus(`Live trending pools - updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - refreshes every minute`);
  };

  const loadMarkets = async () => {
    if (!liveRows.length) return;
    setLiveState('loading');
    marketRequest?.abort();
    marketRequest = new AbortController();
    const timeout = setTimeout(() => marketRequest.abort(), 8000);
    try {
      const response = await fetch(marketUrl, { signal: marketRequest.signal, cache: 'no-store' });
      if (!response.ok) throw new Error('Market feed unavailable');
      const payload = await response.json();
      if (!Array.isArray(payload?.data) || payload.data.length < 3) throw new Error('Market feed incomplete');
      const tokens = new Map((payload.included || [])
        .filter(item => item?.type === 'token' && item?.id && item?.attributes)
        .map(item => [item.id, item.attributes]));
      const safe = payload.data.slice(0, 3).map(pool => {
        const attributes = pool?.attributes || {};
        const tokenId = pool?.relationships?.base_token?.data?.id;
        const token = tokens.get(tokenId) || {};
        const symbol = typeof token.symbol === 'string' ? token.symbol : attributes.name?.split(' / ')[0];
        return {
          name: typeof token.name === 'string' ? token.name : attributes.name,
          symbol,
          address: typeof token.address === 'string' ? token.address : '',
          image: safeImage(token.image_url),
          current_price: Number(attributes.base_token_price_usd),
          market_cap: Number(attributes.market_cap_usd ?? attributes.fdv_usd),
          change_1h: Number(attributes.price_change_percentage?.h1),
          volume_1h: Number(attributes.volume_usd?.h1)
        };
      }).filter(coin => typeof coin.name === 'string' && typeof coin.symbol === 'string');
      if (safe.length !== 3) throw new Error('Market feed invalid');
      renderMarkets(safe);
    } catch {
      setLiveState('error');
      liveStatus('Live trending pools are temporarily unavailable - showing no estimate');
      setText('demo-note', 'Live data could not be loaded. Scout does not substitute stale or invented figures.');
    } finally { clearTimeout(timeout); }
  };
  liveRows.forEach(row => row.addEventListener('click', event => {
    const index = Number(row.dataset.liveRow);
    const ca = event.target?.closest?.('.coin-ca');
    if (ca) { copyMarketAddress(index, ca, true); return; }
    showMarket(index);
  }));
  const contract = document.getElementById('demo-contract');
  contract?.addEventListener('click', () => copyMarketAddress(Number(contract.dataset.marketIndex), contract));
  loadMarkets();
  window.setInterval(() => { if (!document.hidden) loadMarkets(); }, 60000);

  /* ------------------------------------------------------ FAQ behaviour */
  const questions = [...document.querySelectorAll('.faq details')];
  questions.forEach(question => question.addEventListener('toggle', () => {
    if (!question.open) return;
    questions.forEach(other => { if (other !== question) other.open = false; });
  }));

  /* ---------------------------------------------------------- Scroll reveal */
  // Keep this list in step with the hidden state in styles.css. Elements start
  // hidden only when scripting is present, so nothing can be stranded invisible.
  const REVEAL = '.reveal';
  const pending = new Set(document.querySelectorAll(REVEAL));
  const revealAll = () => {
    pending.forEach(el => el.classList.add('is-in'));
    pending.clear();
  };

  // Deliberately a position check rather than an IntersectionObserver. An observer
  // only reports a change in intersection, so anything the visitor skipped over, by
  // clicking a nav anchor that jumps down the page, never reports and stays invisible.
  // Comparing the top edge against the fold reveals skipped elements too.
  const revealStep = () => {
    if (!pending.size) return;
    const fold = window.innerHeight * 0.92;
    for (const el of pending) {
      if (el.getBoundingClientRect().top < fold) {
        el.classList.add('is-in');
        pending.delete(el);
      }
    }
  };

  if (calm.matches) revealAll();

  /* ------------------------------------------------------------- Nav shadow */
  // The bar is translucent and sits over content, so it wants a little lift as soon
  // as there is something behind it. One handler drives both this and the reveal.
  const nav = document.querySelector('.nav');
  const progress = document.getElementById('scroll-progress');
  const navLinks = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const sections = navLinks.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);

  /* ------------------------------------------------------------- Backdrop */
  // Two fixed layers behind the page: a grid that drifts with the scroll, and a glow that
  // leans away from the pointer as the page moves under it. The offsets are written as
  // plain lengths into custom properties, so the movement itself stays a compositor
  // transform. Sizes are in viewport units on purpose: a light a thousand pixels wide
  // does not visibly answer a pointer that only shifts it by thirty, and the first version
  // moved it by exactly that much, which read as a static texture rather than as depth.
  //
  // Like the scroll progress bar, this is kept for everyone rather than suppressed behind
  // reduced motion: it is tied to the reader's own scroll and pointer, it never animates on
  // its own, and it is the page's one piece of atmosphere.
  const backdrop = document.getElementById('backdrop');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const paintBackdrop = () => {
    if (!backdrop) return;
    const page = document.documentElement;
    const travel = page.scrollHeight - window.innerHeight;
    const progress = travel > 0 ? Math.min(1, Math.max(0, window.scrollY / travel)) : 0;
    // The grid walks against the scroll and the glow with it, at two speeds: the pair is
    // what makes the layers read as one behind the other rather than as a wallpaper.
    backdrop.style.setProperty('--grid-y', `${(-progress * Math.min(620, page.clientHeight * .8)).toFixed(1)}px`);
    backdrop.style.setProperty('--glow-y', `${(progress * Math.min(380, page.clientHeight * .45)).toFixed(1)}px`);
  };

  /* ---------------------------------------------------- Pointer: the light */
  // One listener for the whole page. It leans the backdrop away from the pointer, which is
  // what makes the two layers feel like they are behind the page rather than painted on it,
  // and moves the accent bloom inside whichever principle card is under the cursor. The
  // bloom is written onto the card itself, so nothing else has to know about it.
  const principleCards = [...document.querySelectorAll('.principle')];
  if (finePointer.matches && (backdrop || principleCards.length)) {
    let pointerFrame = 0;
    let pointerX = 0;
    let pointerY = 0;
    let pointerTarget = null;
    window.addEventListener('pointermove', event => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      pointerTarget = event.target;
      if (pointerFrame) return;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        if (backdrop) {
          const x = (pointerX / window.innerWidth - .5) * -36;
          const y = (pointerY / window.innerHeight - .5) * -24;
          backdrop.style.setProperty('--pointer-x', `${x.toFixed(2)}vw`);
          backdrop.style.setProperty('--pointer-y', `${y.toFixed(2)}vh`);
        }
        const card = pointerTarget?.closest?.('.principle');
        if (!card) return;
        const box = card.getBoundingClientRect();
        card.style.setProperty('--card-x', `${(pointerX - box.left).toFixed(0)}px`);
        card.style.setProperty('--card-y', `${(pointerY - box.top).toFixed(0)}px`);
      });
    }, { passive: true });
  }

  /* -------------------------------------------------- Section links, quietly */
  // A section link scrolls without writing `#edge` into the address bar: the bar keeps
  // showing plain scoutai.trade, and a link copied out of it cannot rot when a section is
  // renamed. The privacy link is a real page, so it is deliberately left alone. A hash that
  // arrives from elsewhere - a bookmark, or a click made before this file loaded - is
  // followed the usual way and then tidied back out of the bar.
  const jumpTo = link => {
    const hash = link.hash;
    if (!hash || hash === '#') return false;
    let target;
    // A malformed href throws here, and one bad link must not take the rest of this with it.
    try { target = document.querySelector(hash); } catch { return false; }
    // scrollIntoView is also the one call here that a bare DOM can be missing, and a jump
    // that cannot happen is worse than the browser's own anchor jump, so that is kept.
    if (!target || typeof target.scrollIntoView !== 'function') return false;
    target.scrollIntoView({ behavior: calm.matches ? 'auto' : 'smooth', block: 'start' });
    // Focus follows the jump so the next Tab press starts where the eye already is. The
    // tabindex exists only to make that possible, and only once per section.
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    return true;
  };
  [...document.querySelectorAll('a[href^="#"]')].forEach(link => {
    // The skip link keeps its native jump: it moves the sequential focus too, which is the
    // whole reason it exists. Its hash is tidied by the hashchange listener below.
    if (link.classList.contains('skip')) return;
    link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button > 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (jumpTo(link)) event.preventDefault();
    });
  });
  const tidyHash = () => {
    if (!location.hash) return;
    // replaceState, not pushState: the fragment leaves the bar without adding an entry for
    // the back button to walk through.
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* the bar keeps what it had */ }
  };
  window.addEventListener('load', tidyHash);
  window.addEventListener('hashchange', tidyHash);

  /* ---------------------------------------------------------- Narrow-screen menu */
  // Below 720px the section links collapse behind this button, so the button has to be
  // able to reopen them. It owns the open state: the stylesheet only reveals a panel
  // once this element exists, which is what keeps the privacy page, which loads theme.js
  // but not this file, on its wrapping-links fallback instead of a menu nothing can open.
  const menu = document.getElementById('nav-menu');
  const setMenu = open => {
    if (!menu) return;
    if (nav) nav.classList.toggle('is-open', open);
    menu.setAttribute('aria-expanded', String(open));
  };
  if (menu) {
    menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
    // Following a section link should not leave the panel sitting over the heading it
    // just jumped to, and it should not leave focus inside a panel that is now hidden.
    navLinks.forEach(link => link.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        menu.focus();
      }
    });
    // A tap anywhere else dismisses it too. Testing the whole bar rather than just the
    // button means a link inside the panel does not trip this on its way out.
    document.addEventListener('click', event => {
      if (nav && !nav.contains(event.target)) setMenu(false);
    });
    // Past the breakpoint the bar shows the links itself, so a panel left open through a
    // resize would otherwise keep the button latched as expanded.
    window.matchMedia('(min-width: 721px)').addEventListener('change', event => {
      if (event.matches) setMenu(false);
    });
  }

  const sync = () => {
    if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 8);
    if (progress) {
      const available = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = `scaleX(${available > 0 ? Math.min(1, window.scrollY / available) : 0})`;
    }
    if (sections.length) {
      let active = sections[0];
      for (const section of sections) if (section.getBoundingClientRect().top <= window.innerHeight * .34) active = section;
      navLinks.forEach(link => {
        const selected = link.getAttribute('href') === `#${active.id}`;
        if (selected) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
    paintBackdrop();
    try { revealStep(); } catch { revealAll(); }
  };

  // Scroll and resize can fire several times before one paint. Keep their layout reads and
  // custom-property writes to one batch per rendered frame. A hidden tab receives no frame,
  // so visibilitychange still calls sync directly and cannot leave the page stale.
  let syncFrame = 0;
  const queueSync = () => {
    if (syncFrame) return;
    syncFrame = requestAnimationFrame(() => { syncFrame = 0; sync(); });
  };
  window.addEventListener('scroll', queueSync, { passive: true });
  window.addEventListener('resize', queueSync, { passive: true });
  // A tab opened in the background gets no frames until it is shown, so run again the
  // moment it comes forward.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  // Once more after load: fonts and images settle and move the fold down.
  window.addEventListener('load', sync);
  sync();
})();
