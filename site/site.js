/*
  Homepage behaviour: the release block, the scroll reveal, and the nav's scrolled
  state. Loaded deferred, and every lookup tolerates its element being absent.

  The privacy page deliberately does not load this file.

  Note for anyone extending this: it used to be one flat block of statements with an
  early return in the middle for "release not published". Anything added below that
  return silently never ran. The release work now lives in its own function so the
  rest of the file cannot be switched off by it.
*/
(() => {
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

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
    setText('release-description', 'Scout is available on the Chrome Web Store. Add it to Chrome, then open Axiom or GMGN and carry on as usual.');
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
      setText(`live-coin-${index}`, symbol.slice(0, 1));
      setText(`live-symbol-${index}`, symbol);
      const symbolEl = document.getElementById(`live-symbol-${index}`);
      if (symbolEl) {
        const name = document.createElement('small');
        name.textContent = coin.name;
        symbolEl.append(' ', name);
      }
      const change = Number(coin.change_1h);
      setText(`live-change-${index}`, `${percent(change)} · 1h`);
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
  liveRows.forEach(row => row.addEventListener('click', () => showMarket(Number(row.dataset.liveRow))));
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
    try { revealStep(); } catch { revealAll(); }
  };

  // Called straight from the event rather than coalesced through requestAnimationFrame.
  // The work is a handful of rect reads and it stops entirely once everything has been
  // revealed, so the coalescing bought nothing, while its "already scheduled" flag could
  // stick permanently if a frame callback never ran. When that happened the reveal froze
  // for the rest of the visit, which is exactly how this shipped the first time.
  window.addEventListener('scroll', sync, { passive: true });
  window.addEventListener('resize', sync, { passive: true });
  // A tab opened in the background gets no frames until it is shown, so run again the
  // moment it comes forward.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  // Once more after load: fonts and images settle and move the fold down.
  window.addEventListener('load', sync);
  sync();
})();
