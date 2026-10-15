import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { checkActiveWebsite, loadSiteCheck } from '../dist/src/siteCheck.js';

const mint = 'G3eJ4GGukKkqy8ftkC5EuzAkbersziWAyxuLCoS9pump';

function mockWebsite(html, tabUrl = 'https://runepunk.gg/') {
  const dom = new JSDOM(html, { url: tabUrl });
  Object.defineProperty(dom.window.document.body, 'innerText', { value: dom.window.document.body.textContent });
  const values = {};
  const prior = { chrome: globalThis.chrome, document: globalThis.document, location: globalThis.location };
  globalThis.chrome = {
    tabs: { async query() { return [{ id: 7, url: tabUrl }]; } },
    scripting: { async executeScript({ func, args }) {
      globalThis.document = dom.window.document;
      globalThis.location = dom.window.location;
      try { return [{ result: func(...args) }]; }
      finally { globalThis.document = prior.document; globalThis.location = prior.location; }
    } },
    storage: { local: { async set(items) { Object.assign(values, items); }, async get(key) { return { [key]: values[key] }; } } }
  };
  return { values, close() { globalThis.chrome = prior.chrome; globalThis.document = prior.document; globalThis.location = prior.location; dom.window.close(); } };
}

test('user-initiated website check records an exact visible mint without page content', async () => {
  const context = mockWebsite(`<main><button>Copy contract address ${mint}</button></main>`);
  try {
    const result = await checkActiveWebsite(mint);
    assert.equal(result.found, true);
    assert.equal(result.origin, 'https://runepunk.gg');
    assert.deepEqual(await loadSiteCheck(mint), result);
    assert.equal(JSON.stringify(context.values).includes('Copy contract'), false);
  } finally { context.close(); }
});

test('a different coin address and Axiom itself cannot pass the website check', async () => {
  const context = mockWebsite('<main>Another token 11111111111111111111111111111111</main>');
  try { assert.equal((await checkActiveWebsite(mint)).found, false); }
  finally { context.close(); }
  const axiom = mockWebsite(`<main>${mint}</main>`, 'https://axiom.trade/pulse');
  try { await assert.rejects(checkActiveWebsite(mint), /coin website/); }
  finally { axiom.close(); }
});
