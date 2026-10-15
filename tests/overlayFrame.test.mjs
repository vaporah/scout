import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { applyOverlayRect, attachOverlayFrame } from '../dist/src/overlayFrame.js';

const mouse = (window, type, x, y) => new window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0, cancelable: true });

test('attachOverlayFrame moves and resizes the element and reports the committed rect', () => {
  const dom = new JSDOM('<div id="panel"><div id="bar"></div><div id="resize"></div></div>');
  const window = dom.window;
  try {
    const panel = window.document.getElementById('panel');
    const bar = window.document.getElementById('bar');
    const resize = window.document.getElementById('resize');
    const commits = [];
    const detach = attachOverlayFrame(panel, { document: window.document, handle: bar, resize, minWidth: 200, minHeight: 120, onCommit: rect => commits.push(rect) });

    bar.dispatchEvent(mouse(window, 'mousedown', 100, 100));
    window.document.dispatchEvent(mouse(window, 'mousemove', 150, 130));
    assert.equal(panel.style.left, '50px');
    assert.equal(panel.style.top, '30px');
    window.document.dispatchEvent(mouse(window, 'mouseup', 150, 130));
    assert.equal(commits.length, 1);

    resize.dispatchEvent(mouse(window, 'mousedown', 0, 0));
    window.document.dispatchEvent(mouse(window, 'mousemove', 260, 160));
    assert.equal(panel.style.width, '260px');
    assert.equal(panel.style.height, '160px');
    window.document.dispatchEvent(mouse(window, 'mouseup', 260, 160));
    detach();
  } finally { window.close(); }
});

test('attachOverlayFrame does not move when the handle target is blocked', () => {
  const dom = new JSDOM('<div id="panel"><div id="bar"><button id="btn">x</button></div></div>');
  const window = dom.window;
  try {
    const panel = window.document.getElementById('panel');
    const bar = window.document.getElementById('bar');
    const button = window.document.getElementById('btn');
    attachOverlayFrame(panel, { document: window.document, handle: bar, isBlocked: target => !!target.closest('button') });
    button.dispatchEvent(mouse(window, 'mousedown', 5, 5));
    window.document.dispatchEvent(mouse(window, 'mousemove', 80, 80));
    assert.equal(panel.style.left, '');
  } finally { window.close(); }
});

test('applyOverlayRect restores a saved position and size', () => {
  const dom = new JSDOM('<div id="p"></div>');
  try {
    const panel = dom.window.document.getElementById('p');
    applyOverlayRect(panel, { left: 10, top: 20, width: 300, height: 200 });
    assert.equal(panel.style.left, '10px');
    assert.equal(panel.style.top, '20px');
    assert.equal(panel.style.width, '300px');
    assert.equal(panel.style.height, '200px');
    assert.equal(panel.style.right, 'auto');
  } finally { dom.window.close(); }
});

test('a restored rect can skip the remembered height so the popup can grow again', () => {
  const dom = new JSDOM('<div id="p"></div>');
  try {
    const panel = dom.window.document.getElementById('p');
    panel.style.height = '120px';
    applyOverlayRect(panel, { left: 5, top: 6, width: 280, height: 120 }, { height: false });
    assert.equal(panel.style.width, '280px');
    assert.equal(panel.style.height, '', 'a stale height must not clip newly revealed sections');
    assert.equal(panel.style.left, '5px');
    assert.equal(panel.style.top, '6px');
  } finally { dom.window.close(); }
});

test('a width-only resize handle never pins the popup height', () => {
  const dom = new JSDOM('<div id="panel"><div id="bar"></div><div id="resize"></div></div>');
  const window = dom.window;
  try {
    const panel = window.document.getElementById('panel');
    const resize = window.document.getElementById('resize');
    attachOverlayFrame(panel, { document: window.document, handle: window.document.getElementById('bar'), resize, minWidth: 200, minHeight: 120, resizeAxis: 'width' });
    resize.dispatchEvent(mouse(window, 'mousedown', 0, 0));
    window.document.dispatchEvent(mouse(window, 'mousemove', 300, 260));
    assert.equal(panel.style.width, '300px');
    assert.equal(panel.style.height, '', 'dragging the corner only changes the width');
  } finally { window.close(); }
});
