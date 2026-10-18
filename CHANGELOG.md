# Changelog

## 0.9.1

- Reduced unnecessary GMGN DOM rescans on live coin charts.
- Prevented repeated service-worker recovery from stacking duplicate stylesheet layers.
- Hard-separated Trenches/Pulse hover research from full coin-page research panels.
- Improved Axiom and GMGN content-script recovery after extension updates.
- Refined filter and display-switch states and kept floating panels inside the viewport.

## 0.9.0

- Reworked Axiom and GMGN updates so unchanged pages reuse their existing token rows and only rediscover the DOM when token cards or routes change.
- Stopped Scout's own badges, tags, and flow chips from triggering page rescans or unnecessary DOM replacement.
- Restored the on-coin research panel for Axiom layouts that expose the active mint through the chart-header copy control instead of the URL.
- Made GMGN switch between list highlighting and the on-coin panel during in-app navigation without requiring a page reload.
- Preserved the on-coin panel through temporary SPA identity gaps and added GMGN chart-header mint detection for ticker-only transition routes.
- Made the on-coin panel reattach itself when a host SPA replaces or removes injected body children.
- Added independent settings for coin information panels and list-row highlights, applied immediately to open tabs.
- Mounted the research panel under the document root and broadened exact-mint detection to unambiguous current URLs and ranked chart-header attributes.
- Rebuilt the display switches with fixed, contained geometry and clearer spacing.
- Made the extension popup open the current Axiom coin directly and retain normal UI during public-feed rate limits.
- Kept the last usable live-feed snapshot during rate-limit backoff instead of replacing the popup with a blocking error screen.
- Added locally bundled branded protocol artwork with lightweight fallbacks for platforms that do not publish a suitable asset.
- Refined launchpad and quote-token filters with cleaner spacing, quieter surfaces, and sharper selected states.
- Added a flat Axiom-compatible wallet import/export workflow with clipboard detection, manual paste, file import, deduplication, and local-only storage.
