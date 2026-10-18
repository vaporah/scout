import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatVersion, isScoutVersion, nextVersion, parseVersion } from '../scripts/version.mjs';
import { extensionVersion, versionLabel } from '../dist/src/version.js';

test('a patch release steps one place and carries at 9', () => {
  assert.equal(nextVersion('0.6.0'), '0.6.1');
  assert.equal(nextVersion('0.6.1'), '0.6.2');
  assert.equal(nextVersion('0.6.8'), '0.6.9');
  // 0.6.9 must become 0.7.0, never 0.6.10: every position stays a single digit.
  assert.equal(nextVersion('0.6.9'), '0.7.0');
  assert.equal(nextVersion('0.7.0'), '0.7.1');
  assert.equal(nextVersion('0.9.9'), '1.0.0');
  assert.equal(nextVersion('1.0.0'), '1.0.1');
  assert.equal(nextVersion('1.9.9'), '2.0.0');
});

test('minor and major releases follow the same single-digit style', () => {
  assert.equal(nextVersion('0.6.3', 'minor'), '0.7.0');
  assert.equal(nextVersion('0.6.0', 'minor'), '0.7.0');
  assert.equal(nextVersion('0.9.4', 'minor'), '1.0.0', 'a minor past 9 carries into the major');
  assert.equal(nextVersion('0.6.3', 'major'), '1.0.0');
  assert.equal(nextVersion('1.4.2', 'major'), '2.0.0');
});

test('the version rule never emits a two-digit position or drops a release', () => {
  let version = '0.6.0';
  const seen = [version];
  for (let step = 0; step < 40; step++) {
    version = nextVersion(version);
    seen.push(version);
  }
  assert.equal(seen[seen.length - 1], '1.0.0', 'forty patch releases from 0.6.0 lands exactly on 1.0.0');
  assert.ok(seen.every(value => /^\d+\.\d\.\d$/.test(value)), 'every value stays single-digit X.Y.Z');
  assert.equal(new Set(seen).size, seen.length, 'no version is ever repeated');
  // Walking forward one step at a time must advance exactly one release: a plain
  // patch step, a patch that rolled into the next minor, or a roll into the major.
  for (let index = 1; index < seen.length; index++) {
    const before = parseVersion(seen[index - 1]);
    const after = parseVersion(seen[index]);
    const stepped =
      (after.major === before.major && after.minor === before.minor && after.patch === before.patch + 1) ||
      (after.major === before.major && after.minor === before.minor + 1 && after.patch === 0) ||
      (after.major === before.major + 1 && after.minor === 0 && after.patch === 0);
    assert.ok(stepped, `${seen[index - 1]} -> ${seen[index]} must be exactly one release step`);
  }
});

test('a malformed or oversized version is normalised rather than trusted', () => {
  assert.deepEqual(parseVersion('0.6.0'), { major: 0, minor: 6, patch: 0 });
  assert.deepEqual(parseVersion('7'), { major: 7, minor: 0, patch: 0 });
  assert.deepEqual(parseVersion(undefined), { major: 0, minor: 0, patch: 0 });
  assert.deepEqual(parseVersion('x.y.z'), { major: 0, minor: 0, patch: 0 });
  assert.equal(formatVersion({ major: 1, minor: 2, patch: 3 }), '1.2.3');
  // The old runaway counter is out of spec, so the next release snaps back into shape.
  assert.equal(nextVersion('0.5.173'), '0.6.0');
  assert.equal(isScoutVersion('0.6.0'), true);
  assert.equal(isScoutVersion('0.6.10'), false, 'a two-digit patch is not the shape Scout ships');
  assert.equal(isScoutVersion('0.6'), false);
});

test('the shipped manifest version always matches package.json', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const source = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(await readFile(new URL('../dist/manifest.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.match(pkg.version, /^\d+\.\d\.\d$/, 'package.json version must be single-digit X.Y.Z');
  assert.equal(source.version, pkg.version, 'the source manifest must not drift from package.json');
  assert.equal(manifest.version, pkg.version, 'dist manifest version must equal package.json');
  assert.equal(lock.version, pkg.version, 'the lockfile must not carry a third number');
  assert.equal(lock.packages[''].version, pkg.version);
  assert.ok(String(source.description).length <= 100, 'the description stays short enough for the extensions page');
});

test('no build path bumps the version', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts.prebuild, undefined, 'a prebuild hook is what made every build a new version');
  assert.equal(pkg.scripts.pretest, undefined, 'running the tests must not cut a release either');
  for (const name of ['build', 'build:compile', 'test', 'typecheck']) {
    assert.doesNotMatch(pkg.scripts[name] ?? '', /release\.mjs|bump\.mjs/, `${name} must not bump the version`);
  }
  for (const name of ['release', 'release:minor', 'release:major']) {
    assert.match(pkg.scripts[name] ?? '', /node scripts\/release\.mjs/, `${name} must go through the release script`);
  }
});

test('the header version chip reads the running extension and stays clean', () => {
  const original = globalThis.chrome;
  try {
    globalThis.chrome = { runtime: { getManifest: () => ({ version: '1.2.3' }) } };
    assert.equal(extensionVersion(), '1.2.3');
    assert.equal(versionLabel(), 'v1.2.3');

    globalThis.chrome = { runtime: { getManifest: () => ({ version: 'not a version' }) } };
    assert.equal(versionLabel(), '', 'a malformed version is never shown');

    globalThis.chrome = { runtime: { getManifest: () => { throw new Error('unavailable'); } } };
    assert.equal(versionLabel(), '', 'a failing manifest lookup is not fatal');

    delete globalThis.chrome;
    assert.equal(versionLabel(), '', 'no extension API means no version chip');
  } finally {
    if (original === undefined) delete globalThis.chrome;
    else globalThis.chrome = original;
  }
});
