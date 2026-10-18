import { readFile, writeFile } from 'node:fs/promises';
import { nextVersion } from './version.mjs';

/**
 * Cut a new Scout release.
 *
 * This is deliberately NOT wired into the build. Bumping on every build produced a
 * version counter that ran away (0.5.111) and told you nothing about what shipped.
 * Run `npm run release` when you actually want a new version, and the number moves
 * exactly one step.
 *
 *   npm run release         patch   0.6.0 -> 0.6.1
 *   npm run release:minor   minor   0.6.3 -> 0.7.0
 *   npm run release:major   major   0.6.3 -> 1.0.0
 *
 * package.json is the single source of truth. The source manifest, the lockfile and
 * the built manifest in dist/ are all kept in step so no two places can disagree.
 */

const kind = process.argv[2] ?? 'patch';
if (!['patch', 'minor', 'major'].includes(kind)) {
  console.error(`Unknown release kind "${kind}". Use patch, minor or major.`);
  process.exit(1);
}

async function readJson(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { return null; }
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

const pkg = await readJson('package.json');
if (!pkg) {
  console.error('package.json is missing or unreadable.');
  process.exit(1);
}

const previous = pkg.version;
const version = nextVersion(previous, kind);
pkg.version = version;
await writeJson('package.json', pkg);

// Keep the source manifest in step; scripts/copy.mjs stamps dist/manifest.json.
const manifest = await readJson('manifest.json');
if (manifest) {
  manifest.version = version;
  await writeJson('manifest.json', manifest);
}

// npm writes its own lockfile version on install, so it drifts if a release is cut
// by hand. Bring it along rather than leaving a third number behind.
const lock = await readJson('package-lock.json');
if (lock) {
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  await writeJson('package-lock.json', lock);
}

console.log(`Scout ${previous} -> ${version} (${kind})`);
console.log('Run "npm run build" (or "npm test") to stamp dist/manifest.json, then reload the extension.');
