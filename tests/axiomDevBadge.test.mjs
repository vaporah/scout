import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractAxiomDevBadge, parseAxiomDevBadge } from '../dist/src/axiomDevBadge.js';

test('dev provenance label parses a recognised classification with the right tone', () => {
  assert.deepEqual(parseAxiomDevBadge('PROVEN DEV'), { classification: 'PROVEN DEV', tone: 'green', details: [] });
  assert.deepEqual(parseAxiomDevBadge('FARMER DEV'), { classification: 'FARMER DEV', tone: 'red', details: [] });
  assert.deepEqual(parseAxiomDevBadge('UNKNOWN DEV'), { classification: 'UNKNOWN DEV', tone: 'neutral', details: [] });
  assert.equal(parseAxiomDevBadge('some random text'), null);
});

test('extractAxiomDevBadge finds the badge and its supporting lines, ignoring Scout UI', () => {
  const dom = new JSDOM(`<body>
    <div class="token-header">
      <div class="dev-badge">
        <strong>PROVEN DEV</strong>
        <p>High contributor: 1 dev token over $2K</p>
        <p>In 1 launchpad - 20+ SOL fees (cross-checked)</p>
      </div>
    </div>
    <aside class="scout-risk">FARMER DEV</aside>
  </body>`);
  try {
    const badge = extractAxiomDevBadge(dom.window.document);
    assert.ok(badge);
    assert.equal(badge.classification, 'PROVEN DEV');
    assert.equal(badge.tone, 'green');
    assert.deepEqual(badge.details, [
      'High contributor: 1 dev token over $2K',
      'In 1 launchpad - 20+ SOL fees (cross-checked)'
    ]);
  } finally { dom.window.close(); }
});

test('extractAxiomDevBadge returns null when no badge is present', () => {
  const dom = new JSDOM('<body><div>Price chart and order book only</div></body>');
  try {
    assert.equal(extractAxiomDevBadge(dom.window.document), null);
  } finally { dom.window.close(); }
});
