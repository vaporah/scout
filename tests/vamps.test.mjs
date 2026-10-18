import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchVampPools, parseVampPools } from '../dist/src/vamps.js';

const mint = '11111111111111111111111111111111';
const copy = '22222222222222222222222222222222';
const third = '33333333333333333333333333333333';

function pairs(...entries) {
  return { pairs: entries };
}

test('only another Solana pool with the exact same ticker counts as a copy', () => {
  const copies = parseVampPools(pairs(
    { chainId: 'solana', baseToken: { address: copy, symbol: 'MCH', name: 'MoonChacha' } },
    { chainId: 'solana', baseToken: { address: mint, symbol: 'MCH', name: 'The coin itself' } },
    { chainId: 'solana', baseToken: { address: third, symbol: 'MCHX', name: 'Not the same ticker' } },
    { chainId: 'ethereum', baseToken: { address: copy, symbol: 'MCH', name: 'Other chain' } },
    { chainId: 'solana', baseToken: { address: 'not-a-mint', symbol: 'MCH', name: 'Junk address' } }
  ), mint, 'MCH');
  assert.deepEqual(copies.map(item => item.mint), [copy]);
  assert.equal(copies[0]?.symbol, 'MCH');
  assert.equal(copies[0]?.name, 'MoonChacha');
  assert.match(copies[0]?.source ?? '', /DEX Screener/);
});

test('the ticker match ignores case but not a different ticker', () => {
  const copies = parseVampPools(pairs(
    { chainId: 'solana', baseToken: { address: copy, symbol: 'mch', name: 'lower' } },
    { chainId: 'solana', baseToken: { address: third, symbol: 'MCH2', name: 'suffixed' } }
  ), mint, 'MCH');
  assert.deepEqual(copies.map(item => item.mint), [copy]);
});

test('one pool per mint, capped, and never invented from junk', () => {
  const many = Array.from({ length: 9 }, (_, index) => ({
    chainId: 'solana',
    baseToken: { address: `${'2'.repeat(31)}${index}`, symbol: 'MCH', name: `Copy ${index}` }
  }));
  assert.equal(parseVampPools(pairs(...many), mint, 'MCH').length, 5, 'the list stays bounded');
  assert.deepEqual(parseVampPools(pairs({ chainId: 'solana', baseToken: { address: copy, symbol: 'MCH' } }, { chainId: 'solana', baseToken: { address: copy, symbol: 'MCH' } }), mint, 'MCH').length, 1, 'duplicate mints collapse');
  assert.deepEqual(parseVampPools(null, mint, 'MCH'), []);
  assert.deepEqual(parseVampPools({}, mint, 'MCH'), []);
  assert.deepEqual(parseVampPools(pairs({ chainId: 'solana', baseToken: { address: copy, symbol: 'MCH' } }), mint, ''), [], 'no symbol, no claim');
});

test('a failed or non-JSON feed lookup never throws', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('nope', { status: 500 });
    assert.deepEqual(await fetchVampPools('MCH', mint), []);
    globalThis.fetch = async () => new Response('{not json', { status: 200 });
    assert.deepEqual(await fetchVampPools('MCH', mint), []);
    globalThis.fetch = async () => { throw new Error('offline'); };
    assert.deepEqual(await fetchVampPools('MCH', mint), []);
    assert.deepEqual(await fetchVampPools('?', mint), [], 'an unknown symbol is not queried');
  } finally { globalThis.fetch = original; }
});

test('a successful lookup asks the feed for the ticker and returns the copies', async () => {
  const original = globalThis.fetch;
  const seen = [];
  try {
    globalThis.fetch = async url => {
      seen.push(String(url));
      return new Response(JSON.stringify(pairs({ chainId: 'solana', baseToken: { address: copy, symbol: 'MCH', name: 'Copy' } })), { status: 200 });
    };
    const copies = await fetchVampPools('MCH', mint);
    assert.deepEqual(copies.map(item => item.mint), [copy]);
    assert.match(seen[0] ?? '', /dexscreener\.com\/latest\/dex\/search\?q=MCH$/);
  } finally { globalThis.fetch = original; }
});
