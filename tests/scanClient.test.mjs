import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const mint = '11111111111111111111111111111111';

/** Load scanClient with a stubbed extension runtime installed first. */
async function withRuntime(sendMessage, run) {
  const original = globalThis.chrome;
  globalThis.chrome = { runtime: { sendMessage } };
  try {
    // A unique query keeps each import from reusing a cached module that captured
    // a different globalThis.chrome at load time.
    const client = await import(`../dist/src/scanClient.js?case=${Math.random()}`);
    await run(client);
  } finally {
    if (original === undefined) delete globalThis.chrome;
    else globalThis.chrome = original;
  }
}

test('a scan that never answers times out instead of hanging the caller forever', async () => {
  await withRuntime(
    // MV3 can tear the worker down mid-flight, and then the callback never fires.
    () => { /* never calls back */ },
    async ({ requestAssessments }) => {
      const started = Date.now();
      await assert.rejects(() => requestAssessments([mint], 40), /timed out/);
      assert.ok(Date.now() - started < 2000, 'the caller is released promptly');
    }
  );
});

test('a real response still resolves, and a runtime error still rejects', async () => {
  await withRuntime(
    (message, callback) => callback({ assessments: [], settings: undefined, errors: [], ath: null, vamps: [] }),
    async ({ requestAssessments }) => {
      const response = await requestAssessments([mint], 200);
      assert.deepEqual(response.assessments, []);
    }
  );

  await withRuntime(
    (message, callback) => { globalThis.chrome.runtime.lastError = { message: 'Extension context invalidated.' }; callback(undefined); },
    async ({ requestAssessments }) => {
      await assert.rejects(() => requestAssessments([mint], 200), /invalidated/);
    }
  );
});

test('a token page with no data yet says so instead of showing nothing at all', async () => {
  const { startTokenPageMonitor } = await import('../dist/src/tokenPageMonitor.js');
  const { mintFromAxiomUrl } = await import('../dist/src/axiomMint.js');
  const dom = new JSDOM('<body></body>', { url: `https://axiom.trade/t/${mint}` });
  const monitor = startTokenPageMonitor(
    href => mintFromAxiomUrl(href),
    async () => ({ assessments: [], settings: undefined, errors: [`${mint.slice(0, 6)}...${mint.slice(-4)}: market lookup unavailable.`], ath: null, vamps: [] }),
    { document: dom.window.document, refreshMs: 60_000 }
  );
  try {
    monitor.start();
    await new Promise(resolve => setTimeout(resolve, 30));
    const panel = dom.window.document.querySelector('.scout-risk');
    assert.ok(panel, 'the popup exists rather than nothing at all');
    assert.equal(panel.classList.contains('is-visible'), true);
    assert.equal(panel.dataset.scoutSeverity, 'neutral');
    assert.equal(panel.dataset.scoutMint, mint, 'it still knows which token it is looking at');
    assert.match(panel.textContent ?? '', /NOT SCANNED YET/);
    assert.match(
      panel.textContent ?? '',
      /Scout has no independent data for this mint yet\. Market lookup unavailable\./,
      'the raw mint prefix is stripped and the sentence is cased for reading'
    );
    assert.doesNotMatch(panel.textContent ?? '', /111111\.\.\.1111/, 'the internal error prefix never reaches the popup');
    assert.match(panel.textContent ?? '', /not a claim about the coin/i, 'silence must not read as a warning');
  } finally { monitor.stop(); dom.window.close(); }
});

test('a failed scan explains what actually went wrong, not one generic line', async () => {
  const { startTokenPageMonitor } = await import('../dist/src/tokenPageMonitor.js');
  const { mintFromAxiomUrl } = await import('../dist/src/axiomMint.js');

  const run = async failure => {
    const dom = new JSDOM('<body></body>', { url: `https://axiom.trade/t/${mint}` });
    const monitor = startTokenPageMonitor(href => mintFromAxiomUrl(href), async () => { throw failure; }, { document: dom.window.document, refreshMs: 60_000 });
    try {
      monitor.start();
      await new Promise(resolve => setTimeout(resolve, 40));
      const panel = dom.window.document.querySelector('.scout-risk');
      assert.equal(panel?.classList.contains('is-visible'), true, 'the popup appears rather than going quiet');
      return panel?.textContent ?? '';
    } finally { monitor.stop(); dom.window.close(); }
  };

  // A timeout is not a failure: the scan is still working and will fill in.
  const slow = await run(new Error('Scout scan timed out'));
  assert.match(slow, /still gathering data/);
  assert.doesNotMatch(slow, /could not reach/);

  // The actionable one: a reloaded extension leaves this tab orphaned until it refreshes.
  const orphaned = await run(new Error('Extension context invalidated.'));
  assert.match(orphaned, /Refresh this page to reconnect/);

  const refused = await run(new Error('Could not establish connection. Receiving end does not exist.'));
  assert.match(refused, /Refresh this page to reconnect/);

  // Anything else keeps the plain wording.
  const other = await run(new Error('something else entirely'));
  assert.match(other, /could not reach its scanner/);
});

test('navigating off a token page still hides the popup entirely', async () => {
  const { startTokenPageMonitor } = await import('../dist/src/tokenPageMonitor.js');
  const { mintFromAxiomUrl } = await import('../dist/src/axiomMint.js');
  const dom = new JSDOM('<body></body>', { url: 'https://axiom.trade/pulse' });
  const monitor = startTokenPageMonitor(
    href => mintFromAxiomUrl(href),
    async () => ({ assessments: [], settings: undefined, errors: [], ath: null, vamps: [] }),
    { document: dom.window.document, refreshMs: 60_000 }
  );
  try {
    monitor.start();
    await new Promise(resolve => setTimeout(resolve, 30));
    const panel = dom.window.document.querySelector('.scout-risk');
    assert.ok(!panel || !panel.classList.contains('is-visible'), 'the pulse table is not a token page');
    assert.equal(panel?.querySelector('.scout-risk-category'), undefined);
  } finally { monitor.stop(); dom.window.close(); }
});
