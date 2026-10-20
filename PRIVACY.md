# Scout privacy policy

**Published at <https://scoutai.trade/privacy/>.** The hosted page is
[`site/privacy/index.html`](./site/privacy/index.html) and must be kept in step with this
file; this one is the source.

**Status: published.** This describes what the extension actually does as built. It is not
legal advice.

Last updated: 19 October 2026

## The short version

Scout is a research tool. It reads public market data about Solana tokens and shows it
beside the coins you are already looking at. The extension has no accounts, analytics,
or tracking. The public website uses Google Analytics to measure aggregate visits and
usage. Everything the extension remembers is stored on your own computer.

## What Scout stores on your device

All of it is local. None of it is transmitted to the publisher or to anyone else.

| Stored | Where | Why |
| --- | --- | --- |
| Your settings (score threshold, minimum liquidity, trade size and slippage) | `chrome.storage.local` | So the extension behaves the way you configured it |
| Pinned mint addresses | Page `localStorage` | So the coins you chose to track survive a reload |
| Platform and quote-asset filters | `chrome.storage.local` | So the popup and the dashboard agree |
| Panel size, position and collapsed state | `chrome.storage.local` | So the popup stays where you put it |
| Coins Scout has seen and their observed highs | `chrome.storage.local` | To work out whether a coin is a repeat and what its high was |

Uninstalling the extension, or clearing site data for `axiom.trade` / `gmgn.ai`, removes
all of it.

## What Scout sends over the network

Scout makes **read-only `GET` requests** for public market data. There are no uploads, no
form posts, and no cookies or credentials are attached to any request. Requests go only
to the hosts listed in the extension's permissions:

- `api.dexscreener.com`: pool, price, liquidity and volume
- `api.geckoterminal.com`: pool data, holder distribution, all-time high
- `api.gopluslabs.io`: token security and holder list
- `api.rugcheck.xyz`: token report, holder accounts, deploying wallet
- `gmgn.ai`: holder count, concentration and wallet-quality figures

The only information in those requests is a **public Solana mint address**: the coin
being looked at. No identifier for you, your browser, your settings or your holdings is
included.

Be aware of the obvious consequence: as with any request to a third party, those services
see your IP address and the fact that this coin was queried. That is inherent to fetching
public data on the internet, and their own privacy policies govern their handling of it.

## Live market panel on scoutai.trade

The homepage's live Solana trending-pools panel requests the top three pools from
`api.geckoterminal.com` when the homepage is open, then refreshes no more than once per
minute. It sends no wallet address, settings, token search, account data or identifier.
Like every public web request, GeckoTerminal receives your IP address. The panel is
optional presentation data and is not a trading signal.

The panel shows each token's published logo, so the browser also fetches those images from
`coin-images.coingecko.com` and `assets.geckoterminal.com`. Those two are the only image
hosts the page is permitted to load, and they see the same thing any image host does: your
IP address and which logo was asked for. If a logo is missing or blocked, the row falls
back to the ticker's first letter.

## Website analytics

`scoutai.trade` uses Google Analytics measurement ID `G-GJPRNYRR0P` to understand
aggregate website visits and page usage. When a website page is open, the browser loads
`gtag.js` from `googletagmanager.com` and sends measurement data to Google Analytics.
Google may receive information such as your IP address, browser and device details,
referring page, pages visited, and interaction timing, subject to Google's own privacy
terms. This website analytics code is not included in the Scout extension and does not
receive wallet addresses, extension settings, seed phrases, or private keys.

## What Scout reads on the page

Scout's content scripts run on `axiom.trade` and `gmgn.ai` only. To match a coin row to a
token, it reads the coin rows on the page: the symbol, the mint address in links or data
attributes, and the visible market figures already shown to you. It does not read form
fields, keystrokes, clipboard contents, other tabs, or any page outside those two.

## What Scout does not do

- No analytics, telemetry, crash reporting or usage statistics in the Scout extension.
- No account, sign-in or identifier of any kind.
- No selling, sharing or transmitting of data about you.
- No remote code. All scripts are packaged in the extension, and the content security
  policy is `script-src 'self'`.
- No trading. Scout never connects a wallet, never signs anything, and never places an
  order or moves funds. It only displays information.

## Permissions, and why each is needed

| Permission | Reason |
| --- | --- |
| `storage` | To keep your settings and remembered panel state on your device |
| `activeTab` | To know which page you are on when you open the popup |
| `scripting` | To place the popup and row highlighting on Axiom and GMGN pages |
| Host access to `axiom.trade`, `gmgn.ai` | The two sites Scout decorates |
| Host access to the five market-data APIs above | To fetch the public data shown in the popup |

## Changes

If a future version changes what is collected or where it is sent, this document will be
updated and the change described in the release notes before that version ships.

## Contact

<privacy@scoutai.trade>
