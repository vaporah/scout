import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('the project ships an MIT licence that agrees with package.json', async () => {
  const licence = await read('LICENSE');
  const pkg = JSON.parse(await read('package.json'));

  assert.equal(pkg.license, 'MIT', 'package.json must name the same licence as the LICENSE file');
  assert.match(licence, /^MIT License/);
  // The two clauses that make this MIT rather than merely MIT-shaped.
  assert.match(licence, /Permission is hereby granted, free of charge/);
  assert.match(licence, /THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND/);
  // A copyright line naming a holder, so the grant has someone to come from.
  assert.match(licence, /^Copyright \(c\) \d{4} \S.*\S$/m, 'the copyright line must name a holder');
});

test('the README names the licence and says what it does not cover', async () => {
  const readme = await read('README.md');
  assert.match(readme, /^## Licence$/m);
  assert.match(readme, /MIT/);
  // The name and the third-party feeds are the two things MIT cannot speak for, and both
  // are the kind of thing a reader would otherwise assume the licence had settled.
  assert.match(readme, /trademark/i);
  assert.match(readme, /DexScreener/);
});
