# Scout implementation audit and checklist

## Existing project audit

Scout is a Manifest V3 Chromium extension with TypeScript popup and dashboard modules and plain CSS. The build uses `tsc` plus `scripts/copy.mjs`; `npm test` builds and runs Node tests with jsdom. There is no React app or backend.

The popup and dashboard use GeckoTerminal's public new-pools feed and the weighted `assess` function. An earlier build offered a simulated demo feed; current UI always opens live and clears the old demo preference. Settings live in extension `localStorage`. GeckoTerminal responses are cached in memory for about one minute. The signal store records bounded status transitions in extension storage. There is no wallet index, Solana RPC adapter, transaction subscription, paper-trading engine, or developer-wallet provider.

The previous Manifest V3 content script scanned GMGN and Axiom page links, coloured rows using a separate DEX Screener rule, and displayed a small page indicator. This rule did not share the dashboard's assessment or critical-risk gates. It could mark an unknown-security coin green because it had buy activity. The separate Scout panel existed because the popup/dashboard are extension pages; their results were not reliably joined to page tokens by a shared mint-keyed analysis record. The content script was also not authorized under GMGN's current terms. The old content script and its background scorer have been removed from the package and source.

Reusable parts retained: GeckoTerminal parser, token and assessment types, weighted scoring, analytics, settings, dashboard, popup, and test fixtures. The user-facing demo selector has been removed.

## Implementation checklist

- [x] Audit project structure, data sources, storage, permissions, and existing tests.
- [x] Check current GMGN terms and public API documentation before page integration.
- [x] Remove unauthorized GMGN/Axiom content-script injection and its separate scoring path.
- [x] Use one mint-keyed assessment function in popup and companion view; reject invalid live mint identities and duplicate observations.
- [x] Reserve green for fresh TOP CANDIDATE status; critical findings override it.
- [x] Show missing evidence, data completeness, and observation expiry.
- [x] Persist bounded mint-keyed signal snapshots and status transitions across popup/dashboard sessions.
- [x] Add an extension-owned compact companion window and exact Solana mint pinning through the documented DEX Screener market-pair endpoint.
- [x] Enrich a bounded set of exact live mints with GoPlus Solana beta security and top-holder fields, keeping missing responses and ambiguous controls UNKNOWN.
- [x] Parse Axiom token routes by full mint and colour only exact, current, shared assessments; clear recycled rows and expired signals.
- [x] Read Axiom Pulse row labels (developer FARMER/UNKNOWN, region, TECH, LARPP) and the column stage, and surface them as page observations in the row tooltip and badge title, separate from independently verified evidence.
- [x] Register a user-authorized Axiom Pulse content script and background worker that uses independent public data, without private Axiom API calls or trades.
- [x] Add an evidence-based token-page risk warning overlay (top-right, draggable, dismissible) driven by the same shared assessment, with categories FARMER DEV, CRITICAL TOKEN SECURITY RISK, RISKY DEV, SUSPICIOUS WALLET CLUSTER, and LIQUIDITY WARNING.
- [x] Add an independent developer-reputation verdict (RISKY DEV / UNKNOWN DEV) from observable launch history, plus a mirror of Axiom's own PROVEN DEV page badge on token pages.
- [x] Replace the warning-only panel with one always-visible token popup: evidence warning, page dev badge, or a green "no critical risk flagged" state, plus a Market & pool block (platform, quote pair, pool age, price, liquidity, volume, buys/sells, cap, FDV).
- [x] Add a coin-history registry: all-time high via GeckoTerminal public daily OHLCV, Scout-observed high, and a Copycat/vampire count for coins sharing the same name with a link to the oldest.
- [x] Add hype/attention signals: narrative keyword matching (Elon/Musk, Trump, AI) and a volume/buyer-breadth attention proxy, surfaced as an additive violet ring and tooltip tags without overriding evidence colours.
- [x] Add a secondary GMGN content script: token chart pages receive the risk warning overlay and list pages receive mint-keyed row highlights, both through the shared assessment engine and only via independent public data APIs.
- [x] Generalize the service-worker sender check to Axiom Pulse/token pages and GMGN while still rejecting lookalike hosts and non-HTTPS senders.
- [x] Give each detected visible Pulse card a scanning or unknown colour immediately; change to amber, red, or green only from a current mint-keyed assessment.
- [x] Scan new cards in bounded follow-up batches while the popup is closed, refresh existing cards, and request fresh evidence when a hidden Pulse tab resumes.
- [x] Target the companion instructions and exact-mint token link at Axiom Pulse.
- [x] Add rate-limit backoff and prevent stale results from retaining a green signal after a failed refresh.
- [x] Require multiple verified evidence categories before the shared engine can label FARMER DEV.
- [ ] Obtain GMGN authorization for reading displayed tokens and modifying Trenches/chart rendering. Until then, GMGN runs as a personal, user-authorized overlay; row discovery is best-effort and unverified against a live authenticated GMGN DOM.
- [ ] Recheck Axiom's current official terms if they become accessible. The user explicitly directed Scout to enable a personal row highlighter despite the terms being inaccessible during development.
- [ ] Add an authorized source for creator identity and launch history, wallet transactions, complete holder distribution, and remaining Token-2022 checks. Keep unsupported checks UNKNOWN.
- [ ] Make the six scoring weights configurable while enforcing a 100-point total.
- [ ] Validate GMGN stage matching by mint, including New, Almost Bonded, and Migrated. Do not infer bonding progress from age.
- [x] Connect token-chart warnings to the same assessment record as the Trenches highlights; verify the GMGN row matcher against the real authenticated interface remains outstanding.
- [ ] Verify the content script against the authenticated Axiom Pulse DOM. Current row discovery uses visible column headings, semantic card markers, and avatar/quick-buy structure. Cards with only a ticker or truncated address stay gray because no exact mint can be scored. No authenticated DOM structure was available during development.
- [ ] Add enough verified developer, wallet, and trade-baseline evidence for a real live TOP CANDIDATE signal. Until then, green remains blocked by the shared scorer.
- [ ] Add forward paper trading and performance validation before treating scoring thresholds as predictive.

## Current data and permission limits

GMGN [Terms of Service §8.8](https://gmgn.ai/static/tos.html) restrict unauthorized browser extensions from extracting service data or modifying page rendering. Its [API guidance](https://docs.gmgn.ai/index/q-a) describes approval for data access. No such authorization is available to Scout. The documented [DEX Screener API](https://docs.dexscreener.com/api/reference) provides market pairs. [GoPlus Solana security](https://docs.gopluslabs.io/reference/solanatokensecurityusingget) can add token authority and top-holder evidence for some exact mints, but its beta coverage can omit new tokens, and it does not establish a verified creator's prior launches or the transaction relationships required for FARMER DEV. Scout queries at most eight mints per scan, caches results for two minutes, and limits requests to ten per minute in each extension view. Its positive holder/authority fields cannot by themselves support a trustworthy live green pick.

The automated tests cover the package boundary, mint deduplication, exact-address lookup against a same-name coin, pinned-mint UI, unknown/stale green exclusion, critical-risk override, provider parsing, dynamic Pulse row matching and cleanup, background sender checks for Axiom and GMGN, the token-page risk warning overlay, GMGN mint parsing and row highlighting, and UI rendering. Tests do not verify behavior inside a live authenticated Axiom or GMGN tab. No real trades are executed.

Axiom's [Pulse documentation](https://docs.axiom.trade/axiom/finding-tokens/pulse) confirms the three column workflow, but documents no stable DOM contract. The user authorized the personal Axiom highlighter directly. Scout now reads only visible row-local full mints and calls independent public data APIs through its own worker; it never calls a private Axiom endpoint. Axiom's official terms could not be reliably retrieved during development. The independent feeds still lack verified developer history and linked-wallet evidence needed for a real green pick or FARMER DEV alert.
