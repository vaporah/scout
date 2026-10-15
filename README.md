# Scout

<p align="center">
  <img src="./scout-raccoon-logo.png" width="128" alt="Scout raccoon wearing a red headband">
</p>

<p align="center"><strong>Evidence-first Solana research for Axiom and GMGN.</strong></p>

<p align="center">
  <a href="https://scoutai.trade/">Website</a> ·
  <a href="./LICENSE">MIT License</a> ·
  <a href="./PRIVACY.md">Privacy</a> ·
  <a href="./SECURITY.md">Security</a>
</p>

Scout is a Chromium extension that adds independent token context to the trading screen. It matches coins by full Solana mint, presents available market and risk evidence, and leaves every trading decision with the user.

## What Scout does

- Matches a coin only after finding its full Solana mint.
- Brings market, holder, developer, token-control, and copycat context into Axiom and GMGN.
- Keeps missing evidence visible instead of treating it as a clean result.
- Never connects a wallet, signs a transaction, or places an order.

## Install locally

1. Run `npm install` and `npm test` (or `npm run build`).
2. Open `brave://extensions` (or `chrome://extensions`), enable Developer mode, and choose **Load unpacked**.
3. Select this project's `dist` folder. If Scout was already loaded, click **Reload**.
4. Open or reload `https://axiom.trade/pulse` in Brave. Scout colours detected coin cards blue while awaiting a scan and gray if the mint or assessment remains unknown. Hover a row with a Scout dot to see its status. The toolbar popup reports how many visible cards Scout found, how many had full mints, and how many are coloured. Scanning continues while the Pulse tab is open, even with the popup closed; when a hidden tab resumes, Scout requests fresh evidence.
5. For detailed evidence, open Scout from the toolbar and choose **Open compact companion**. You can also copy a coin's full Solana mint from Axiom, paste it into **Track an exact Axiom coin**, and choose **Track mint**. Scout keeps up to five pinned mints and refreshes their independent market observations while the companion window is open.

## Reading a coin

- The toolbar popup lists recent observations as compact coin rows: the coin's own logo, ticker and age, live chips (5m change, liquidity change, top-10 share, buy/sell counts) and the Scout score with its status badge. Click any coin to open its **coin card**, and use **← All coins** to come back.
- Every coin row, dashboard card and detail card shows the **developer verdict** (`GOOD DEV`, `RISKY DEV` or `UNKNOWN DEV`) with the reason in its tooltip. "We could not verify this creator" is reported as UNKNOWN DEV rather than hidden, matching the verdict the page panels show.
- **Vampire check.** On a coin page the popup always answers the vamp question: the verdict strip carries a `Vamp` chip (`no copies`, `1 copy`, `3 copies`…) and the Coin history block either lists the same-name coins (with explorer links, the oldest one called out, and how many came from the feed) or states plainly that none were found. A single-mint scan also searches the public feed for other Solana pools on the same ticker, so the answer works on a fresh page where Scout has never seen the other coins; feed matches are labelled as ticker matches rather than coins Scout observed, and the popup says which of the two checks ran.
- Coin logos come from the public pool feed (GeckoTerminal / DEX Screener `imageUrl`) and are only accepted as plain https URLs with no embedded credentials; anything else is ignored. A logo is drawn over the deterministic tinted initial, and a logo that fails to load is removed so the initial stays readable. Logos load eagerly so they still appear in a background companion window.
- The coin card is the same card the companion dashboard shows for the selected coin: identity, verdict with confidence and data completeness, the metric grid (market cap, liquidity, 5m volume, 5m price, buy/sell volume, estimated impact), entry conditions, supporting evidence, warnings, and the source line with the mint and the Axiom link.
- The dashboard adds missing evidence, the score breakdown and status history under the same card. Both surfaces render it from one renderer, so a coin reads identically wherever it is opened.
- The popup and dashboard open directly into live data. Their headers keep the raccoon logo at the top right, and the dashboard's Stage and Status filters remain labelled.
- **Launchpad picker.** The dashboard and the popup both show a `Launchpads` panel: a card of toggle pills, one per platform in the current scan, each with its own colour and a count, plus `Select all` and a `Show more` expander once there are more than twelve. Selecting platforms narrows both lists (a coin must match any selected platform); `Select all` clears the selection, and the choice is stored in `localStorage` under `scout.platforms.v1` so the popup and dashboard always agree. Every card also names its platform.
- The key is the **pool platform the feed reports** (`pumpfun`, `raydium`, `meteora`, `orca`, `moonshot`, `boop`, `bonk`, `believe`, `usepaid`, `stonk`), so a coin that migrated from pump.fun to Raydium is listed under Raydium. Coins whose feed reports no platform share an `Unknown platform` chip instead of being hidden, and an unreadable selection falls back to showing everything.

## Token chart warnings

Opening an Axiom token page (`/t/{mint}` or `/meme/{mint}`), or a GMGN token page (`/sol/token/{mint}`), opens a top-right **Scout popup** that always shows a verdict: an evidence-based warning when one exists, otherwise the host page's developer badge or a green **NO CRITICAL RISK FLAGGED** state. Warning categories are evidence-driven: **FARMER DEV** (red, requires multiple verified wallet/transaction evidence categories), **CRITICAL TOKEN SECURITY RISK**, **RISKY DEV**, **SUSPICIOUS WALLET CLUSTER**, and **LIQUIDITY WARNING**.

The popup also shows a **Holders** block that is always on screen, in every mode, because who holds a coin is the real evidence on a pair with no other history: the holder count, the combined top-10 share, the largest wallet or account, and what the developer still holds. It is followed by a **Wallet quality** block (the deployer's track record, bundled buys, snipers, bots/degen wallets and fresh wallets, each as a share of supply) which is what separates a crowd that arrived on its own from one that was funded to buy the launch. A **Market & pool** block gives platform/DEX, quote pair, pool age, price and 5m change, liquidity and its change, 5m volume, buys/sells, buyers/sellers, the **Movement** read, market cap and FDV, and a **Token checks** block covers mint/freeze authority, transfer control, top-10 holders and data completeness. **Coin history** carries the **all-time high** (from GeckoTerminal's public daily OHLCV), Scout's own observed high, and a **Copycat/vampire** count when other coins share the same name (with a link to the oldest one). The popup is draggable, collapsible, dismissible per token, and links only to real explorer addresses. It never injects token metadata as HTML and never covers GMGN or Axiom trade controls. Its width and position are remembered, but never its height: the panel has to be free to grow when a section opens, so the body scrolls inside a maximum height instead.

### Where holder and developer data comes from

No single public source covers every Solana mint, so Scout asks several and fills in whatever each one has. Sources are tried in order and each only fills a gap the previous ones left:

| Source | Contributes |
| --- | --- |
| DEX Screener | Pool, price, liquidity, volume and buy/sell counts. Can lag a launch by minutes. |
| GeckoTerminal | Holder count and distribution bands, the developer address and the developer's share. Has no pool at all for some coins. |
| GoPlus security | The ranked holder list, holder count, and the token-control fields. |
| Solana token report | For coins no indexer lists: name, symbol, price, liquidity, holder count, the largest accounts, the deploying wallet and what it still holds. |
| Trading stat feed | Holder count, top-10 concentration, developer holding, and the wallet-quality signals above. |

Two rules keep the numbers honest. A figure a source reports as `0` is only treated as zero where that is a real measurement: a deployer holding nothing is a fact worth showing, while a top-10 share of `0` on a coin whose pool holds almost everything is treated as *not published*, because understating concentration is the dangerous direction. And nothing is ever invented to fill a gap: a missing figure reads as `Not published yet`, never as a zero.

## Attention highlights and dev reputation

- **RISKY DEV** is Scout's independent verdict when a developer's observable history shows repeated rapid failures or creator-linked selling; missing evidence stays UNKNOWN DEV. It never labels a new wallet malicious.
- **Narrative match** (violet ring) flags coins whose name/symbol matches a known hype keyword set (Elon/Musk, Trump, AI). This is a keyword proxy, not proof a specific person tweeted about the coin.
- **Attention** (same ring, logged in the tooltip) flags strong 5-minute volume relative to liquidity and broad unique-buyer participation, an on-chain proxy for "getting talked about".
- **Running** (blue row wash and badge, e.g. `SCOUT · RUNNING 3.5×`) marks a coin that has turned over its own pool inside five minutes. It is deliberately independent of the score: a brand-new pair has no creator history, holder breakdown or token-control data, so most of its score is made of things nobody can know yet, while the fact that it is moving is fully visible. Blue is neither the green of a candidate nor the amber of a caution: it claims activity, never quality.
- **Platform & category tags** (colored chips) label each coin's current pool platform (pump.fun, Raydium, Meteora, Orca, Moonshot, Bonk, Boop, Believe, UsePaid, Stonk, …) and heuristic categories such as **Charity**, AI, Elon, and Trump from the name/symbol. The platform comes from the provider's DEX id (the current pool, which may differ from the original launchpad after migration); the categories are name/symbol keywords, not verified claims.
- Both are additive to the evidence colour; they never turn a risky or unknown coin green.

## GMGN (secondary surface)

GMGN is supported as a personal, user-authorized overlay through the same assessment engine. On GMGN token pages Scout shows the top-right risk warning; on list pages it highlights rows keyed by full mint links. GMGN publishes no stable DOM contract, so row discovery is best-effort and unverified against a live authenticated GMGN session. Scout calls only independent public data APIs; it does not call GMGN's private endpoints, modify its controls, or place trades.

## Security and wallet safety

Scout is designed so it cannot touch your wallet or funds:

- It never reads, requests, or stores a seed phrase, mnemonic, or private key, and never accesses a wallet provider (`window.ethereum`, Phantom, Solflare, etc.).
- It never signs or submits a transaction and never clicks or modifies Axiom/GMGN buy or sell buttons. It only reads visible page text and adds read-only styling and panels.
- The service worker calls only these documented public APIs: `api.geckoterminal.com`, `api.dexscreener.com`, and `api.gopluslabs.io`. No other hosts are allowed.
- Permissions are minimal (`storage`, `activeTab`, `scripting`). No `cookies`, `webRequest`, `tabs`, `<all_urls>`, or clipboard access. `externally_connectable` and `web_accessible_resources` are not declared, so no web page can message the extension or load its files.
- The extension pages run under a strict CSP (`script-src 'self'; object-src 'self'`) and ship no remote code: every script is bundled locally.
- All page- and provider-supplied text is rendered with `textContent` or escaped, so token names/metadata cannot inject HTML or script.
- Network responses are treated as untrusted: mints, pool addresses, and holder addresses are validated as Solana base58, website links are sanitized to clean HTTPS URLs, and unsupported fields stay `Unknown` rather than being invented.
- Data supplied to third-party APIs is limited to the exact mint addresses being analyzed (which reveals the tokens you look up to those providers, a privacy consideration rather than a wallet one).

`tests/security.test.mjs` enforces these invariants on every build: minimal permissions, a strict CSP, and a scan of the shipped scripts for `eval`, `new Function`, wallet/tx APIs, cookies, and insecure `http://` URLs.

## What works

- A GeckoTerminal public new-pool feed supplies Solana mint addresses, pool age, market cap when present, price, liquidity, five-minute volume, and transaction counts. Results are cached for about one minute, with rate-limit backoff.
- Pasted mint addresses are looked up by exact address through DEX Screener's public Solana pool endpoint. A same-name or same-ticker coin cannot be substituted. Missing pool data remains UNKNOWN.
- For up to eight exact mints per scan, including pinned mints first, Scout queries [GoPlus's Solana token-security API](https://docs.gopluslabs.io/reference/solanatokensecurityusingget) for mint/freeze authority, transfer-control evidence, and a top-holder snapshot. Results are cached, calls are bounded below the [public 30/minute limit](https://docs.gopluslabs.io/reference/support), and missing or ambiguous fields stay UNKNOWN. GoPlus's Solana API is beta and may omit newly launched tokens.
- The popup and companion view use the same mint-keyed assessment function. Thresholds are configurable in the companion view; the initial scoring weights are currently fixed.
- On Axiom Pulse, steel means scanning, gray means mint or evidence unknown, amber means WATCH or liquidity caution, red means a detected risk, and green means a fresh TOP CANDIDATE. A gray row is not assessed as safe. Colours are research labels, not predictions.
- Scout's own interface is black with a red accent: the same palette is used by the popup, the dashboard, the token-page panel and the Pulse hover panel, so page overlays look like part of one product. Verdict colours stay semantic (green is a fresh top candidate, amber is a caution, red is a detected risk) because those carry meaning rather than branding.
- Hovering a Pulse row also shows the page's own classification tags (developer FARMER/UNKNOWN, region, TECH, LARPP, and the New Pairs / Final Stretch / Migrated column) as "Axiom tags". These are observations read from the page, kept separate from Scout's independent evidence, and never treated as verification. The hover panel can be dragged by its top bar and resized by its corner (or closed) so it never blocks the coins you want to check; its width and position are remembered.
- Scout reads a Pulse card's mint from its own links, copy-address controls, data attributes and printed addresses, and takes the first Solana token route Axiom serves (`/t/`, `/meme/`, `/token/`, `/coin/`, `/trade/`, `/pulse/`, `/pair/`, a `?mint=`/`?ca=` query or a `#/t/` hash route). A card is matched only when exactly one full mint is present; a lookalike host, a ticker, or a card printing two different addresses stays unidentified rather than guessed. Scout's own badges, tags and `data-scout-*` attributes are never read back as identity.
- The popup always shows what the card itself prints right now - price, 5m change, age, market cap, liquidity, volume and buy/sell counts read straight off the visible row - so a card Scout cannot verify still reads as real market data instead of a wall of UNKNOWN. Facts the card does not print are simply absent, never invented.
- When no assessment exists yet, a "Scout scan" section states exactly where the scan stands: which lookup is running, when the next re-check happens, and that Scout will not guess a mint. Placeholder rows of UNKNOWN are never printed.
- Coin history compares the row against coins Scout has already observed (observed high plus any earlier same-name copycat), so a trench row reads the same way as an open chart. The `−` button in the panel bar switches it to a short view that keeps the status, verdict, score and mint and hides market, checks, developer, signals and history; that choice is remembered. A refresh that finds the same facts leaves the panel untouched instead of rebuilding it.
- On Axiom and GMGN token chart pages, a draggable top-right panel shows the highest-priority evidence-based warning from the same shared assessment. Dismissing hides the panel for that token only; it never disables the risk engine. `▾` hides the market, checks and history sections for a short verdict-only view, and `−` collapses the panel to its header; both choices are remembered across refreshes. The panel rebuilds only when its content actually changes, so it no longer flashes or resets while it polls.
- Green is reserved for a fresh **TOP CANDIDATE** with all required evidence. WATCH is amber. Missing creator, holder, or token-control evidence receives no positive points and blocks a top-candidate signal. A transfer fee, hook, or upgrade power alone is not labelled a proven transfer block.
- Critical risks override score. The FARMER DEV rule requires multiple categories of provider-verified wallet and transaction evidence. The current live feed supplies none, so Scout does not issue a live FARMER DEV claim.
- The companion view displays score components, missing evidence, source, mint, observation expiry, recent status changes, and a normal link to open the token on Axiom. The product opens directly into live data; the simulated provider remains an internal test fixture and is not selectable in the UI.
- Scout does not trade, sign transactions, or request wallet keys.

## Integration status

Axiom's [Pulse documentation](https://docs.axiom.trade/axiom/finding-tokens/pulse) describes New Pairs, Final Stretch, and Migrated. Scout's user-authorized content script identifies visible coin cards and looks for full mint links or explicit row attributes. Cards without a reliable mint stay gray; they are not submitted for a score. The extension worker requests independent market and security data for identified mints. It does not call Axiom's private endpoints or place trades. Axiom does not publish a stable Pulse DOM contract; after a site change, some cards may be skipped until the row matcher is updated. Token-page warning panels are implemented and shown when the shared assessment actually supports a category; the current feeds cannot yet verify the linked-wallet transactions required for a live FARMER DEV.

The Axiom mint parser and row-colouring renderer reject truncated addresses and same-name matches, remove colours when rows are reused, and accept only current shared assessments. Axiom's official terms could not be retrieved during development, so page use depends on your direction to enable this personal overlay; no Axiom partnership or endorsement is claimed.

The automatic public market feed covers **new pools only**. Pinned mints can be older, but their Axiom stage is marked UNKNOWN. GoPlus may supply a current top-holder snapshot and some token-control checks, but coverage is incomplete and its holder tags are not treated as verified pool or burn classifications. None of these feeds verifies Axiom's New Pairs, Final Stretch, or Migrated labels, creator identity and launch history, linked-wallet transactions, liquidity locks, or every Token-2022 restriction. Current live feeds therefore cannot produce a green TOP CANDIDATE under the evidence gates. A visible score is a research summary, not a validated trading signal. The screenshot styling and starter scoring weights have not been validated for predictive performance.

For the architecture audit, implementation checklist, and remaining work, see [IMPLEMENTATION.md](./IMPLEMENTATION.md).

## Licence

MIT. See [LICENSE](./LICENSE). Copyright (c) 2026 Brightside.

You may use, modify, redistribute and sell this software, including as part of a
closed-source product, provided the copyright notice and the permission notice are kept.
There is no warranty.

Two things the licence deliberately does **not** cover:

- **The name and the mascot.** MIT grants no rights to the Scout name, logo or artwork.
  A fork is welcome; a fork that presents itself as Scout is not, and trademark is the
  lever for that, not copyright.
- **Third-party data.** Scout reads public endpoints operated by DexScreener,
  GeckoTerminal, GoPlus, RugCheck and GMGN. Their terms govern that data, not this
  licence, and they are free to change, rate-limit or block it at any time.
