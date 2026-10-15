# Scout store listing and submission pack

**Status: draft, reviewed by the publisher before release.** Everything here describes the
extension as built. The store copy is a claim about your product, so read it and make it
yours before publishing.

## Store copy

**Name:** Scout

**Summary** (the `description` field in `manifest.json`, which `tests/version.test.mjs`
keeps under 100 characters):

> Mint-matched Axiom and GMGN row highlights with holder, developer and risk readouts.

**Category:** Productivity (alternatives: Developer Tools)

**Detailed description:**

> **Scout reads the coins you are already looking at, and tells you who is behind them.**
>
> Scout works on Axiom Pulse and GMGN. It matches each visible coin row to its exact
> Solana mint, so two coins sharing a ticker are never confused for one another. Nothing
> is scored until a full mint is found.
>
> **On a list of coins**, Scout colours each row it has matched and shows a badge: a score
> and verdict where the evidence supports one, a colour-coded caution where it does not,
> and a blue `RUNNING` badge for a coin that has turned over its own pool inside five
> minutes.
>
> **On a coin's own page**, the popup answers the questions that decide a trade:
>
> - **Holders**: how many there are, how concentrated the top ten are, the largest
>   wallet or account, and what the developer still holds.
> - **Wallet quality**: the deployer's track record, bundled buys, snipers, bots and
>   fresh wallets, each as a share of supply. A thousand wallets funded to buy the launch
>   is a different trade from a thousand that found it on their own.
> - **Market & pool**: price, liquidity, volume, buys versus sells, and how hard the
>   coin is actually trading relative to its own pool.
> - **Token checks**: mint and freeze authority, transfer control, top-10 concentration.
> - **Is this a copycat?**: other coins trading under the same name, and the all-time
>   high, so you can see whether this is the original or the trap.
>
> **What Scout will not do.** It never claims a coin is safe. Where the evidence is
> missing it says so (`Not published yet`, `Unknown`) rather than showing a zero, and it
> keeps an unverified creator labelled `UNKNOWN DEV` instead of guessing. A `WAIT FOR
> CONFIRMATION` badge is not a recommendation to avoid; it means Scout does not yet have
> enough to say anything useful.
>
> **No account. No wallet connection. No tracking.** Scout has no analytics, never signs
> anything and never places a trade. It reads public market data and stores your settings
> on your own machine.

## Permission justifications

Chrome Web Store review asks for a reason per permission. Suggested wording:

| Permission | Justification |
| --- | --- |
| `storage` | Saves the user's own settings, filters and remembered panel position locally. |
| `activeTab` | Identifies the current tab when the user opens the extension's toolbar popup. |
| `scripting` | Injects the row highlighting and the token-page popup into Axiom and GMGN pages. |
| `https://axiom.trade/*` | The primary site the extension decorates. |
| `https://gmgn.ai/*` | The secondary site the extension decorates, and a source of public holder figures. |
| `https://api.dexscreener.com/*` | Public market data: pool, price, liquidity, volume. |
| `https://api.geckoterminal.com/*` | Public pool, holder-distribution and all-time-high data. |
| `https://api.gopluslabs.io/*` | Public token security and holder list. |
| `https://api.rugcheck.xyz/*` | Public token report: holders, supply, deploying wallet. |

**Single purpose statement:** Scout displays risk and holder information for Solana tokens
on the trading sites the user is already browsing. That is its only purpose.

**Remote code:** none. All JavaScript is packaged in the extension, and the content
security policy is `script-src 'self'; object-src 'self'`.

## Privacy practices answers

| Question | Answer |
| --- | --- |
| Does the extension collect or use personal or sensitive user data? | No. |
| Does it transmit data off the device? | Only public market-data `GET` requests containing a public mint address. No user data. |
| Is data sold to third parties? | No. |
| Is data used for purposes unrelated to the single purpose? | No. |
| Does it use remote code or eval? | No. |
| Privacy policy URL | <https://scoutai.trade/privacy/> |
| Homepage URL | <https://scoutai.trade/> |
| Support contact | <hello@scoutai.trade> |

## Known limitations, and be upfront about these

1. **It reads third-party endpoints that are not officially supported for this use.**
   DexScreener, GeckoTerminal, GoPlus, RugCheck and the GMGN statistics endpoint can
   change, rate-limit or block at any time, and their terms may not permit redistribution.
   This is the largest risk to a public release, and the most likely source of user
   reports.
2. **No source covers every coin.** Figures may be missing on very new tokens; the popup
   says `Not published yet` rather than guessing. This is by design, not a bug.
3. **Scores are not advice.** A low score on a brand new pair usually means "not enough
   evidence yet", not "bad coin". Scout surfaces movement separately for exactly that
   reason.
4. **Not affiliated with Axiom, GMGN or any data provider.** Say so in the listing, and
   avoid their logos in any store artwork.

## Suggested screenshots

1. A Pulse list with several rows coloured, one showing the blue `RUNNING` badge.
2. A coin page popup showing Holders and Wallet quality together.
3. The Market & pool and Token checks blocks.
4. The Copycat/vampire block on a coin with same-name copies.

## Hosting and email (live)

| Piece | Where |
| --- | --- |
| Site source | `site/` in this repository |
| Host | Cloudflare Pages project `scout`, connected to `vaporah/scout` |
| Production branch | `main`, every push redeploys automatically, no manual upload |
| Build command | *(empty: the site is static HTML)* |
| Build output directory | `site` |
| Preview URL | <https://scout-7tp.pages.dev> |
| Live URL | <https://scoutai.trade> |

Email Routing on `scoutai.trade`, both rules Active, forwarding to `thezadmin@gmail.com`:

- `privacy@scoutai.trade`: the contact on the privacy policy
- `hello@scoutai.trade`: the support contact in this listing

The MX, SPF and DKIM records are managed by Cloudflare and show as **Locked** in the
dashboard. Changing the forwarding destination is done under Email → Email Routing →
Destination addresses; a new address must be verified by email before it can be used.

## Before submitting

- [ ] Confirm the privacy policy is reachable at <https://scoutai.trade/privacy/> **before**
      submitting: review will fetch it, and a dead link is a rejection.
- [ ] Make `privacy@scoutai.trade` a real mailbox. Registrars usually offer free forwarding to
      an address you already read; if that is a hassle, point both documents at a contact form
      or a repository URL instead, since a bounce fails the same requirement.
- [ ] Deploy the `site/` folder as the site root (plain static HTML, no build step. See the
      hosting steps in this file).
- [ ] Confirm the summary in `manifest.json` still matches the extension's behaviour.
- [ ] Load the packed `dist` folder in a clean browser profile and click through Axiom and
      GMGN once each; confirm no console errors and that the popup appears.
- [ ] Run `npm test`: the suite must be green, and note that it must be green *twice in a
      row*, since this project has had timing-sensitive tests before.
- [ ] Build the upload artefact with `npm run pack`. It refuses to run if `dist` is stale, so
      a green run means the zip matches the version in `package.json`.
- [ ] Decide the answer to "does this extension contain ads or in-app purchases" (currently
      neither).
