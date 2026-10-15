import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { bindProtocolPicker, protocolPicker, selectAllId, showMoreId, visibleLimit } from '../dist/src/protocolPicker.js';

const option = (id, label, count) => ({ id, label, color: '#f97316', count });

function render(html) {
  const dom = new JSDOM(`<div id="app">${html}</div>`);
  return { dom, app: dom.window.document.getElementById('app') };
}

test('every launchpad in the scan becomes a pill with its count', () => {
  const { dom, app } = render(protocolPicker({
    items: [option('raydium', 'Raydium', 3), option('pumpfun', 'pump.fun', 1)],
    selected: [],
    expanded: false
  }));
  try {
    const pills = [...app.querySelectorAll('.protocol-pill')];
    assert.deepEqual(pills.map(pill => pill.dataset.platform), ['raydium', 'pumpfun']);
    assert.deepEqual(pills.map(pill => pill.querySelector('.protocol-name')?.textContent), ['Raydium', 'pump.fun']);
    assert.deepEqual(pills.map(pill => pill.querySelector('.protocol-count')?.textContent), ['3', '1']);
    assert.deepEqual(pills.map(pill => pill.querySelector('.protocol-icon')?.textContent), ['R', 'P']);
    assert.ok(pills.every(pill => pill.classList.contains('is-on')), 'no selection means every launchpad is shown');
    assert.equal(app.querySelector(`#${selectAllId}`)?.hasAttribute('disabled'), true, 'nothing to select back yet');
    assert.equal(app.querySelector('.protocols-title')?.textContent, 'Launchpads');
  } finally { dom.window.close(); }
});

test('a selection marks only its pills and offers select all', () => {
  const { dom, app } = render(protocolPicker({
    items: [option('raydium', 'Raydium', 3), option('pumpfun', 'pump.fun', 1)],
    selected: ['pumpfun'],
    expanded: false
  }));
  try {
    const pills = [...app.querySelectorAll('.protocol-pill')];
    assert.deepEqual(pills.map(pill => pill.classList.contains('is-on')), [false, true]);
    assert.deepEqual(pills.map(pill => pill.getAttribute('aria-pressed')), ['false', 'true']);
    const all = app.querySelector(`#${selectAllId}`);
    assert.equal(all?.textContent, 'Select all');
    assert.equal(all?.hasAttribute('disabled'), false);
  } finally { dom.window.close(); }
});

test('a launchpad mark replaces the letter monogram, and only a markless platform falls back', () => {
  const mark = '<svg class="protocol-logo" viewBox="0 0 24 24"><path d="M12 4v16"/></svg>';
  const { dom, app } = render(protocolPicker({
    items: [{ ...option('pumpswap', 'PumpSwap', 2), mark }, option('newpad', 'New Pad', 1)],
    selected: [],
    expanded: false
  }));
  try {
    const pills = [...app.querySelectorAll('.protocol-pill')];
    assert.equal(pills[0].querySelector('.protocol-icon svg')?.getAttribute('class'), 'protocol-logo');
    assert.equal(pills[0].querySelector('.protocol-icon')?.textContent, '', 'the mark carries no letter too');
    assert.equal(pills[1].querySelector('.protocol-icon svg'), null, 'no mark means the monogram');
    assert.equal(pills[1].querySelector('.protocol-icon')?.textContent, 'N');
  } finally { dom.window.close(); }
});

test('a launchpad with nothing on screen is dimmed and hides its zero', () => {
  const { dom, app } = render(protocolPicker({
    items: [option('raydium', 'Raydium', 3), option('orca', 'Orca', 0)],
    selected: [],
    expanded: false
  }));
  try {
    const pills = [...app.querySelectorAll('.protocol-pill')];
    assert.equal(pills[0].classList.contains('is-idle'), false);
    assert.equal(pills[0].querySelector('.protocol-count')?.textContent, '3');
    assert.equal(pills[1].classList.contains('is-idle'), true, 'an idle launchpad is still selectable, just quieter');
    assert.equal(pills[1].querySelector('.protocol-count'), null, 'a zero count is left off rather than printed');
    assert.match(pills[1].getAttribute('title') ?? '', /0 coins in this scan/);
  } finally { dom.window.close(); }
});

test('the list is capped until the expander is used', () => {
  const items = Array.from({ length: visibleLimit + 5 }, (_, index) => option(`p${index}`, `Pad ${index}`, 1));
  const { dom, app } = render(protocolPicker({ items, selected: [], expanded: false }));
  try {
    assert.equal(app.querySelectorAll('.protocol-pill').length, visibleLimit);
    const more = app.querySelector(`#${showMoreId}`);
    assert.equal(more?.textContent?.trim().startsWith(`Show more ${5}`), true);
    assert.equal(more?.getAttribute('aria-expanded'), 'false');
  } finally { dom.window.close(); }

  const expandedDom = render(protocolPicker({ items, selected: [], expanded: true }));
  try {
    assert.equal(expandedDom.app.querySelectorAll('.protocol-pill').length, items.length);
    assert.equal(expandedDom.app.querySelector(`#${showMoreId}`)?.textContent?.trim().startsWith('Show less'), true);
  } finally { expandedDom.dom.window.close(); }
});

test('no launchpads means no picker at all', () => {
  assert.equal(protocolPicker({ items: [], selected: [], expanded: false }), '');
});

test('the pills, the bulk action and the expander all report their intent', () => {
  const items = Array.from({ length: visibleLimit + 2 }, (_, index) => option(`p${index}`, `Pad ${index}`, 1));
  const { dom, app } = render(protocolPicker({ items, selected: ['p0'], expanded: false }));
  try {
    const toggles = [];
    let more = 0;
    bindProtocolPicker(app, { onToggle: id => toggles.push(id), onToggleMore: () => { more++; } });
    app.querySelector('.protocol-pill[data-platform="p1"]')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    app.querySelector(`#${selectAllId}`)?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    app.querySelector(`#${showMoreId}`)?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(toggles, ['p1', ''], 'an empty id means select all');
    assert.equal(more, 1);
  } finally { dom.window.close(); }
});
