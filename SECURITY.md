# Security policy

Scout is a read-only research extension. It must never request wallet credentials, connect a wallet, sign a transaction, or submit an order.

## Supported version

Security fixes are made on the current `main` branch and included in the next extension release.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Send a concise report to [hello@scoutai.trade](mailto:hello@scoutai.trade) with:

- A clear description of the issue and its impact.
- Reproduction steps or a minimal proof of concept.
- The affected Scout version and browser.

Do not include seed phrases, private keys, wallet credentials, personal data, or real funds in a report. Scout will acknowledge a valid report and work toward a fix before public disclosure.

## Security boundaries

- The extension has no wallet-provider access and never requests keys or signatures.
- Public data requests are limited to the explicitly declared HTTPS hosts in the extension manifest.
- Page and provider text is treated as untrusted and rendered as text rather than executable markup.
- Website code is protected by a restrictive content security policy and has no form submissions or account system.
