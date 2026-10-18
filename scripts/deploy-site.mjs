/*
  Publishes site/ to the Cloudflare Pages project `scout`, which is what serves
  scoutai.trade.

  This is the command line deploy. It exists because Cloudflare's own Git integration for
  this project was authorised through a GitHub App installation that no longer exists: the
  repository picker in the dashboard comes back empty, so the project cannot be reconnected
  from the browser until that authorisation is redone. See DEPLOY-SITE.md.

  It uses the same upload Cloudflare's dashboard does, so there is no build step and no
  difference between what this publishes and what a click in the dashboard publishes.

  Run it with `npm run deploy:site`. The post-commit hook calls it after a commit that
  touches site/, so a commit is normally all it takes.
*/
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');

if (!existsSync(site)) {
  console.error(`No site/ folder at ${site}. Nothing to publish.`);
  process.exit(1);
}

// Wrangler is fetched on demand rather than pinned as a dependency, because it is only
// needed to publish and not to build or test anything else in this repository.
//
// On Windows npx is a shell script, so it is reached through cmd. Node warns when
// arguments are handed to a shell, and going through cmd explicitly keeps npm's own
// argument escaping rather than concatenating the list into one string.
const isWindows = process.platform === 'win32';
const args = [
  '--yes', 'wrangler@4', 'pages', 'deploy', 'site',
  '--project-name=scout',
  // The production branch. Anything else lands as a preview deployment instead of
  // replacing the live site.
  '--branch=main',
  // The commit hook runs after a commit, and a commit can leave the tree dirty. Without
  // this wrangler refuses to publish and asks for a flag it cannot infer here.
  '--commit-dirty=true'
];

const result = spawnSync(
  isWindows ? 'cmd.exe' : 'npx',
  isWindows ? ['/d', '/c', 'npx', ...args] : args,
  { cwd: root, stdio: 'inherit' }
);

if (result.error) {
  console.error(`Could not start wrangler: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    '\nPublishing failed.\n' +
    'If this is the first time on this machine, authorise wrangler once with:\n' +
    '  npx wrangler login\n' +
    'Then run npm run deploy:site again.\n'
  );
  process.exit(result.status ?? 1);
}
