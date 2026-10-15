import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWebsiteInfo, parseWebsiteInfo, sanitizeWebsiteUrl } from '../dist/src/websiteInfo.js';

const mint = 'G3eJ4GGukKkqy8ftkC5EuzAkbersziWAyxuLCoS9pump';
const other = '22222222222222222222222222222222';
const third = '33333333333333333333333333333333';
const now = 1_791_866_600_000;

function payload(address = mint, websites = ['https://runepunk.gg'], verified = false) {
  return {
    data: {
      id: `solana_${address}`, type: 'token',
      attributes: {
        address, name: 'Runepunk Legends', symbol: 'Runepunk', websites,
        gt_verified: verified, launchpad_details: { completed_at: '2026-10-13T04:33:26.000Z' }
      }
    }
  };
}

test('parses the exact RunePunk-style token info as a claimed website, without inventing verification', () => {
  assert.deepEqual(parseWebsiteInfo(payload(), mint, now), {
    mint, websiteUrl: 'https://runepunk.gg/', gtVerified: false, observedAt: now
  });
  assert.equal(parseWebsiteInfo(payload(other), mint, now), null);
  assert.equal(parseWebsiteInfo({ ...payload(), data: { ...payload().data, id: `solana_${other}` } }, mint, now), null);
  assert.equal(parseWebsiteInfo({ ...payload(), data: { ...payload().data, attributes: { ...payload().data.attributes, address: mint.toLowerCase() } } }, mint, now), null);
  assert.deepEqual(parseWebsiteInfo(payload(mint, [], 'unknown'), mint, now), {
    mint, websiteUrl: null, gtVerified: null, observedAt: now
  });
});

test('accepts only sane HTTPS website links and removes tracking query and fragment', () => {
  assert.equal(sanitizeWebsiteUrl('https://runepunk.gg/arena?ref=coin#address'), 'https://runepunk.gg/arena');
  for (const url of ['http://runepunk.gg', 'javascript:alert(1)', 'https://name:pass@runepunk.gg',
    'https://runepunk.gg:8443', 'https://localhost', 'https://127.0.0.1', 'https://runepunk.gg\\@evil.com',
    'https://runepunk.gg\n.evil.com', 'https://foo.internal']) {
    assert.equal(sanitizeWebsiteUrl(url), null, url);
  }
  assert.equal(parseWebsiteInfo(payload(mint, ['http://unsafe.test', 'https://runepunk.gg/']), mint, now)?.websiteUrl, 'https://runepunk.gg/');
});

test('fetches only the exact mint, caches a valid response for at least a minute, and leaves failed identity unknown', async () => {
  const previous = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async url => {
    requested.push(String(url));
    return new Response(JSON.stringify(payload(other)), { status: 200 });
  };
  try {
    assert.deepEqual(await fetchWebsiteInfo(other, now), {
      mint: other, websiteUrl: 'https://runepunk.gg/', gtVerified: false, observedAt: now
    });
    assert.equal((await fetchWebsiteInfo(other, now + 60_000)).observedAt, now);
    assert.equal(requested.length, 1);
    assert.equal(requested[0], `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${other}/info`);
    assert.equal((await fetchWebsiteInfo(other, now + 91_000)).observedAt, now + 91_000);
    assert.equal(requested.length, 2);
    assert.deepEqual(await fetchWebsiteInfo('not-a-mint', now), {
      mint: 'not-a-mint', websiteUrl: null, gtVerified: null, observedAt: null
    });
    const mismatched = await fetchWebsiteInfo(third, now + 92_000);
    assert.deepEqual(mismatched, { mint: third, websiteUrl: null, gtVerified: null, observedAt: null });
  } finally { globalThis.fetch = previous; }
});

test('returns unknown during 429 backoff and bounds request rate', async () => {
  const previous = globalThis.fetch;
  const firstMint = '44444444444444444444444444444444';
  const laterMint = '55555555555555555555555555555555';
  const requested = [];
  globalThis.fetch = async url => {
    const address = String(url).split('/').at(-2);
    requested.push(address);
    if (address === firstMint) return new Response('', { status: 429, headers: { 'Retry-After': '10' } });
    return new Response(JSON.stringify(payload(address, [], null)), { status: 200 });
  };
  try {
    assert.equal((await fetchWebsiteInfo(firstMint, now + 200_000)).observedAt, null);
    assert.equal((await fetchWebsiteInfo(laterMint, now + 201_000)).observedAt, null);
    assert.deepEqual(requested, [firstMint]);
    assert.equal((await fetchWebsiteInfo(laterMint, now + 211_000)).observedAt, now + 211_000);

    const slots = 'ABCDEFGHJKLM';
    const rateTime = now + 400_000;
    for (const letter of slots) await fetchWebsiteInfo(letter.repeat(32), rateTime);
    // The earlier 200k/211k requests fall outside this fresh 60s window, so a
    // full window of 12 lookups is available; the 13th distinct mint is blocked.
    assert.equal(requested.length, 14); // first 429 + later success + twelve allowed lookups
  } finally { globalThis.fetch = previous; }
});
