import { strict as assert } from 'node:assert';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>');
const { document } = dom.window;

test('the mascot badge asks for the packaged logo rather than a page-relative path', async () => {
  const { scoutMark, scoutMarkFile, assetUrl } = await import('../dist/src/asset.js');
  const badge = scoutMark(document, 'scout-risk-icon');
  const image = badge.querySelector('img');
  assert.equal(image?.getAttribute('src'), assetUrl(scoutMarkFile), 'a bare filename would be requested from axiom.trade and 404');
  assert.equal(image?.getAttribute('alt'), '', 'decorative artwork stays out of the accessibility tree');
  assert.equal(badge.getAttribute('aria-hidden'), 'true');
});

test('a mascot that cannot load is replaced by vector art, never left as a broken box', async () => {
  const { scoutMark } = await import('../dist/src/asset.js');
  const badge = scoutMark(document, 'scout-risk-icon');
  assert.equal(badge.querySelector('img') !== null, true);

  badge.querySelector('img')?.dispatchEvent(new dom.window.Event('error'));

  const image = badge.querySelector('img');
  const fallback = badge.querySelector('.scout-risk-icon-fallback');
  assert.equal(image, null, 'the broken image is removed instead of shown');
  assert.notEqual(fallback, null);
  assert.equal(fallback?.querySelector('svg') !== null, true, 'the stand-in is inline DOM, so no img-src policy can block it');
  assert.equal(badge.childElementCount, 1, 'the badge holds exactly one piece of artwork');
});

test('the fallback cannot be made to carry page content', async () => {
  const { scoutMark } = await import('../dist/src/asset.js');
  const badge = scoutMark(document, 'scout-pulse-tooltip-mark');
  badge.querySelector('img')?.dispatchEvent(new dom.window.Event('error'));
  const svg = badge.querySelector('svg');
  assert.equal(svg?.querySelectorAll('script, foreignObject, image, use').length, 0, 'no scripting or external references inside the stand-in');
});
