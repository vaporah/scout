# Scout website and release setup

## Production hosting, verified 14 October 2026

Scout already uses Cloudflare Pages. Keep this setup:

- Project: `scout`, connected to `vaporah/scout`.
- Production branch: `main`; pushes deploy automatically.
- Build command: empty. Build output: `site`.
- Production: https://scoutai.trade (Cloudflare reports Active, SSL enabled).
- Pages URL: https://scout-7tp.pages.dev.
- Apex DNS: proxied CNAME `scoutai.trade` → `scout-7tp.pages.dev`.
- Cloudflare Email Routing is enabled. Preserve its MX, SPF and DKIM records.

The earlier instructions to replace DNS with Sites A/TXT records do not apply. They were for a separate private preview created before the existing Cloudflare setup was inspected. Do not replace the working Cloudflare Pages record.

The separate private preview is https://scoutai-trade.sweetguppy12.chatgpt.site. Its project identity is retained in `.openai/hosting.json`; its isolated checkout is `.site-hosting/`. Production updates use Cloudflare Pages, not that preview.

## Cloudflare injects a Web Analytics beacon

Every live page ends with a script Cloudflare appends at the edge:

```html
<script type="module" src="https://static.cloudflareinsights.com/beacon.min.js/..."></script>
```

Our content security policy is `script-src 'self'`, so **the browser blocks it**. The request fails with `csp` and nothing is recorded. Web Analytics is therefore switched on in the Cloudflare dashboard while collecting nothing, and the privacy page picks up a script tag it does not want.

Two ways to fix it, and the choice is the owner's:

- **Turn Web Analytics off**: Cloudflare dashboard → the `scoutai.trade` zone → Analytics & Logs → Web Analytics → disable the site. This keeps the strict CSP, keeps `/privacy/` genuinely script-free, and loses nothing because the beacon is already blocked. This is the recommended option.
- **Allow the beacon**: add `https://static.cloudflareinsights.com` to `script-src` in [`site/_headers`](./site/_headers) and add a line to the privacy policy about site analytics. Only worth doing if visitor analytics are actually wanted.

Cloudflare also appends `email-decode.min.js` for Email Address Obfuscation. That one is same-origin, so the CSP permits it, and it removes itself after running. Leave it alone.

## Website updates

Edit files in [site/](./site/), check them, then commit and push the website changes to `main`. Check the corresponding Cloudflare Pages deployment succeeds and that https://scoutai.trade serves the new content. No extension build is needed.

### Bump the asset version

Cloudflare Pages serves non-HTML assets with `max-age=14400` and **ignores `Cache-Control` from `_headers`** (tested: a cache miss still returned `max-age=14400` with `no-cache` set). The stylesheet and scripts therefore cannot revalidate on their own.

Whenever the contents of `styles.css`, `theme.js`, `site.js` or `release-config.js` change, bump the `?v=` on its `<link>`/`<script>` tag in `index.html`, `privacy/index.html` and `404.html`. HTML is revalidated on every request, so bumping the number there is enough to push the new asset out immediately. Miss this and the change hides behind the stale copy for up to four hours, with new markup rendered against the previous theme.

## Colour theme

`theme.js` owns light and dark. It is loaded **blocking in `<head>`** so the theme is settled before the first paint; deferred, someone who chose light on a dark system would see a dark flash and then a swap. The choice is stored in `localStorage` under `scout.theme.v1`, and with no stored choice the stylesheet follows `prefers-color-scheme` on its own.

It is a separate file rather than a few inline lines because the content security policy is `script-src 'self'`, which blocks inline scripts, so the usual inlined theme snippet is not available to us.

All three pages use system font stacks and token-driven colour, so the only difference between the themes is the palette. The toggle adds a `theme-js` class to `<html>`; the button itself is hidden until that class appears, so anyone without scripting never sees a control that does nothing.

The privacy page carries `theme.js` and nothing else, purely so its colours match the theme chosen elsewhere on the site. Its policy text is plain HTML and reads fully with scripting off.

## Extension release

[release-config.js](./site/release-config.js) keeps the download disabled until an actual public release exists. Set `released: true`, the real `version`, and an HTTPS `downloadUrl` pointing to the published release with installation instructions or approved browser store listing. Set `sourcePublic: true` only when the repository is publicly accessible.

Example (replace the version and URL with the real released values):

```js
window.SCOUT_RELEASE = Object.freeze({
  released: true,
  version: '1.0.0',
  downloadUrl: 'https://github.com/vaporah/scout/releases/tag/v1.0.0',
  sourcePublic: true,
  sourceUrl: 'https://github.com/vaporah/scout'
});
```

Missing or invalid release settings keep the download disabled. At launch, update the HTML description/social metadata to reflect availability and re-check the published privacy policy against the final extension. The landing-page product illustration uses fictional tokens and data, explicitly labelled as such.
