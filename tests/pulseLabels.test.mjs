import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extractRowLabels, formatPulseLabels, parsePulseLabels, stageFromHeading, stageLabel } from '../dist/src/pulseLabels.js';

test('Pulse labels parse dev, region, tech and liquidity tags from row text', () => {
  const labels = parsePulseLabels('ART Array Reverse Transcriptase 🧬 1.28% 🟢 FARMER AUS TECH LARPP MC $7K');
  assert.equal(labels.dev, 'FARMER');
  assert.equal(labels.region, 'AUS');
  assert.equal(labels.tech, true);
  assert.equal(labels.larpp, true);
  assert.equal(formatPulseLabels(labels), 'FARMER \u00b7 AUS \u00b7 TECH \u00b7 LARPP');
});

test('Pulse labels treat UNKNOWN dev and extra tags without inventing a region', () => {
  const labels = parsePulseLabels('Spookinu 👻 UNKNOWN CA TECH LARPP MC $5K');
  assert.equal(labels.dev, 'UNKNOWN');
  assert.equal(labels.region, 'CA');
  assert.equal(labels.tech, true);

  const spray = parsePulseLabels('LSTR Lago Strategy 📈 FARMER SPRAY EU TECH LARPP');
  assert.equal(spray.dev, 'FARMER');
  assert.equal(spray.region, 'EU');
  assert.ok(spray.others.includes('SPRAY'));

  const none = parsePulseLabels('Fish IsHoulder Hold 👤 1.28% MC $24K');
  assert.equal(none.dev, null);
  assert.equal(none.region, null);
  assert.equal(none.tech, false);
  assert.equal(formatPulseLabels(none), null);
});

test('extractRowLabels reads tags from a row element and stage maps to column names', () => {
  const dom = new JSDOM('<div>🟢 FARMER SG TECH LARPP MC $3K</div>');
  try {
    const labels = extractRowLabels(dom.window.document.querySelector('div'));
    assert.equal(labels.dev, 'FARMER');
    assert.equal(labels.region, 'SG');
    assert.equal(labels.tech, true);
  } finally { dom.window.close(); }

  assert.equal(stageFromHeading('New Pairs'), 'new');
  assert.equal(stageFromHeading('Final Stretch'), 'bonding');
  assert.equal(stageFromHeading('Migrated'), 'migrated');
  assert.equal(stageFromHeading('Other'), 'unknown');
  assert.equal(stageLabel('new'), 'New Pairs');
  assert.equal(stageLabel('migrated'), 'Migrated');
});
