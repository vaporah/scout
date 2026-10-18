# Deploying the website

The website is the `site/` folder in this repository. It goes live at
<https://scoutai.trade> through the Cloudflare Pages project `scout`.

There are three ways to publish, in order of how much setup they need.

## 1. Publish by hand, right now

```sh
npx wrangler login     # once per machine, opens a browser to authorise
npm run deploy:site
```

`npx wrangler login` is a one time step and is left to you on purpose: it is a credential
handshake, so it should happen in your browser and not be created on your behalf. After
that, `npm run deploy:site` uploads `site/` and prints the URL Cloudflare published.

## 2. Publish by committing

The `post-commit` hook in `.githooks/` calls the step above whenever a commit touches
`site/`, so a commit is all it takes. It never fails a commit: if the publish cannot run,
the commit still stands and the reason is printed, because losing a commit to a network
problem would be far worse than a stale website.

It is already switched on for this clone (`git config core.hooksPath .githooks`). A fresh
clone needs that one command, and turning it off is
`git config --unset core.hooksPath`.

Only `site/` is published. The extension in `src/` is released separately, so a commit
that only touches it deploys nothing.

## 3. Publish by pushing

`.github/workflows/deploy-site.yml` publishes `site/` whenever `main` changes underneath
it, and once it is working it is the nicest of the three because the deploy happens on
GitHub and is recorded next to the commit.

It needs two things that are not in place yet, and both are account level rather than
repository level:

1. **A Cloudflare API token**, stored as the repository secret
   `CLOUDFLARE_API_TOKEN`. Create one at
   <https://dash.cloudflare.com/profile/api-tokens> with **Create Custom Token**, giving
   it `Account` then `Cloudflare Pages` then `Edit`, and scoping it to this account. Then
   add it under the repository's **Settings**, **Secrets and variables**, **Actions**,
   **New repository secret**. Copy it straight from Cloudflare into that form. It is a
   credential, so it should not pass through a chat window or a file in the repository.
2. **GitHub Actions actually running.** This repository is private, and at the time of
   writing no workflow run has ever been recorded for it, not even one started by hand
   from the Actions tab. Actions is fully enabled in the repository's own settings and the
   workflow file is accepted, which points at the account's Actions allowance rather than
   at anything in this repository. Check **Billing and plans** on the account and confirm
   Actions minutes are available.

Until the token exists the job logs a notice and skips rather than failing, so a missing
token is visible without turning every push red.

## Why the dashboard Git integration is not the answer

Cloudflare Pages was previously connected to this repository through Cloudflare's own Git
integration. It broke: it was authorised through a GitHub App installation that no longer
exists, so every build it started failed with `Repository not found`, and because those
failures were only reported in the Pages dashboard, changes appeared to deploy when they
had not.

Choosing **Connect** on the project's **Settings**, then **Builds and deployments**, then
**Git repository** still opens the form, and it still lists `vaporah` as the Git account,
but the repository picker answers `No matches found`. That is a lapsed GitHub
authorisation rather than a missing repository: Cloudflare is no longer able to list the
account's repositories. The form remembers `site` as the build output directory, so the
only broken part is the authorisation.

To restore it, redo the GitHub side:

1. Revoke the stale grant at <https://github.com/settings/applications>, and check
   <https://github.com/settings/installations> for a Cloudflare Pages app installation to
   remove if one is listed twice.
2. Reconnect from the project's **Settings**, then **Builds and deployments**, then
   **Connect**, and this time the repository picker should list `scout`.

Worth doing, but nothing above depends on it.

## What is not covered

None of these publish the browser extension. Changes under `src/` are released with
`npm run release`, which is a Chrome Web Store upload and not a website deploy.

## The separate website repository

There is a second repository, `vaporah/scout-site`, created to hold the website on its own
so that this repository is only the extension. It is private, and at the time of writing it
is empty: the migration is prepared but deliberately not applied.

The reason it was not finished is that moving `site/` out of this clone would take the
deploy command with it, leaving nobody able to publish until they cloned the new repository
and set the hook up again. A website that cannot be deployed is worse than a website that
lives beside the extension, so the split waits until it is wanted.

It was also created on the theory that a separate repository would let GitHub Actions run,
since public repositories get Actions for free and this one records no runs at all, not
even from a manual dispatch. That theory did not survive testing: a freshly created
repository also recorded no runs on the push that added the workflow, so the obstacle is at
the account level and a split does not address it.

The prepared migration is on the local branch `site-root`, which holds the site's history
with `site/` as the repository root, plus its own `README.md`, `.gitattributes`,
`.gitignore` and workflow. Applying it means pushing that branch to `main` on
`vaporah/scout-site`, then deleting `site/` here along with this file, `.githooks/`,
`scripts/deploy-site.mjs` and `.github/workflows/deploy-site.yml`. The one thing that needs
care is `tests/siteSecurity.test.mjs`, which reads `../site/` and has to move with the site
or this repository's test suite will fail.

Branches are local only, so nothing is lost by leaving it prepared.

