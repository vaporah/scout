import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const distFile = name => new URL(`../dist/${name}`, import.meta.url);

test('manifest requests only minimum permissions, no wallet access, and a strict CSP', async () => {
  const manifest = JSON.parse(await readFile(distFile('manifest.json'), 'utf8'));
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'scripting']);
  for (const dangerous of ['cookies', 'webRequest', 'webRequestBlocking', 'tabs', 'clipboardRead', 'clipboardWrite', 'management', 'proxy', 'debugger', 'nativeMessaging'])
    assert.ok(!manifest.permissions.includes(dangerous), `must not request ${dangerous}`);
  assert.equal(manifest.externally_connectable, undefined, 'no external pages may message the extension');
  // The content script draws the Scout mascot badge, so exactly one image is
  // exposed - and only to the two sites Scout runs on, never to every page.
  assert.deepEqual(manifest.web_accessible_resources, [{
    resources: ['scout-raccoon-logo.png'],
    matches: ['https://axiom.trade/*', 'https://gmgn.ai/*', 'https://www.gmgn.ai/*']
  }], 'only the mascot image may be exposed, and only to Scout host pages');
  assert.ok(manifest.host_permissions.every(host => /^https:\/\/[a-z0-9.-]+\/\*$/.test(host)), 'hosts must be explicit HTTPS origins');
  assert.ok(!manifest.host_permissions.some(host => host === '<all_urls>' || host.includes('*://*')));
  assert.match(manifest.content_security_policy.extension_pages, /script-src 'self'/);
  assert.match(manifest.content_security_policy.extension_pages, /object-src 'self'/);
  assert.equal(manifest.background.service_worker, 'src/background.js');
});

test('shipped scripts contain no code execution, wallet, or exfiltration APIs', async () => {
  const files = ['axiomOverlay.js', 'tokenPage.js', 'gmgn.js', 'src/background.js'];
  const banned = [
    /\beval\s*\(/, /new\s+Function/, /document\.write/, /window\.ethereum/, /\.signTransaction/,
    /\.sendTransaction/, /requestAccounts/, /privateKey/i, /mnemonic/i, /seedPhrase/i, /chrome\.(cookies|webRequest)/
  ];
  for (const file of files) {
    const code = await readFile(distFile(file), 'utf8');
    for (const pattern of banned) assert.doesNotMatch(code, pattern, `${file} matched ${pattern}`);
    assert.doesNotMatch(code, /http:\/\//i, `${file} contains an insecure http:// URL`);
  }
});
