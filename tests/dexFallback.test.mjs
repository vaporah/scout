import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchMint, isUnidentifiedToken, parseDexPairs, parseDexSocialSignals, parseGeckoTokenPools } from '../dist/src/dex.js';

const mint = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';
const pool = 'AAA1111111111111111111111111111111111111111';

function payload(now) {
  return {
    data: [{
      attributes: {
        address: pool, reserve_in_usd: '20000', base_token_price_usd: '0.001',
        market_cap_usd: '50000', fdv_usd: '60000', price_change_percentage: { m5: '5' },
        transactions: { m5: { buys: 10, sells: 2, buyers: 8, sellers: 2 } },
        volume_usd: { m5: '4000', m15: '6000' }, pool_created_at: new Date(now - 60_000).toISOString()
      },
      relationships: {
        dex: { data: { id: 'solana_raydium' } },
        quote_token: { data: { id: 'solana_SOLPLACEHOLDER' } }
      }
    }],
    included: [
      { id: `solana_${mint}`, attributes: { address: mint, name: 'Test Coin', symbol: 'TEST' } },
      { id: 'solana_SOLPLACEHOLDER', attributes: { symbol: 'SOL' } }
    ]
  };
}

test('a mint with no pool in the feeds is an absence, not a scored zero', () => {
  const now = Date.now();
  // Both market sources answer "no pool here" with this stand-in rather than failing.
  const empty = parseDexPairs([], mint, now);
  assert.equal(empty.symbol, '?');
  assert.equal(isUnidentifiedToken(empty), true, 'the stand-in must be recognised, so it is never scored');
  // Anything real at all means the coin is merely thinly covered, and it is scored normally.
  assert.equal(isUnidentifiedToken({ ...empty, holderCount: 12 }), false);
  assert.equal(isUnidentifiedToken({ ...empty, poolAddresses: [pool] }), false);
  assert.equal(isUnidentifiedToken({ ...empty, symbol: 'TEST' }), false);
  assert.equal(isUnidentifiedToken({ ...empty, priceUsd: 0.001 }), false);
});

test('DEX profile socials are normalized and paid boosts stay separate from hype', () => {
  const pair = {
    info: {
      websites: [{ url: 'https://coin.example.org/launch?utm_source=dex#top' }],
      socials: [
        { platform: 'twitter', handle: 'https://twitter.com/scoutcoin/status/123456789?ref=profile' },
        { platform: 'telegram', handle: '@scoutcoin' },
        { platform: 'x', handle: 'javascript:alert(1)' }
      ]
    },
    boosts: { active: 7 }
  };
  assert.deepEqual(parseDexSocialSignals(pair), {
    websiteUrl: 'https://coin.example.org/launch',
    xUrl: 'https://x.com/scoutcoin/status/123456789',
    telegramUrl: 'https://t.me/scoutcoin',
    xPostUrl: 'https://x.com/scoutcoin/status/123456789',
    activeBoosts: 7,
    source: 'DEX Screener token profile'
  });
  assert.equal(parseDexSocialSignals({ info: { socials: [{ platform: 'x', handle: 'bad handle!' }] } }), null);
});

test('a token page follows a pool address to the token it holds', async () => {
  const oldFetch = globalThis.fetch;
  // Axiom's token route carries the pool, not the mint, so asking for it as a mint finds
  // nothing at all while the coin is trading fine.
  const pool = 'FccPZe43BFZqg9pyN5VPUwjTe5h7Dy5Fp7QZ9tKoxw';
  const held = 'A2yA6AFtfKkfVkfsnGpvsKoUV5kQPpMYboZsBPvmkA9T';
  const calls = [];
  globalThis.fetch = async url => {
    const target = String(url);
    calls.push(target);
    if (target.includes(`/token-pairs/v1/solana/${pool}`)) return new Response('[]', { status: 200 });
    if (target.includes(`/token-pairs/v1/solana/${held}`)) {
      return new Response(JSON.stringify([{
        chainId: 'solana', dexId: 'pumpfun', pairAddress: pool,
        baseToken: { address: held, name: 'Saindra', symbol: 'SAINDRA' },
        quoteToken: { symbol: 'SOL' },
        liquidity: { usd: 16_000, quote: 100.25 }, priceUsd: '0.0002', marketCap: 18_600, fdv: 18_600,
        volume: { m5: 4_000 }, txns: { m5: { buys: 20, sells: 9 } }, priceChange: { m5: 3 }
      }]), { status: 200 });
    }
    if (target.includes(`/latest/dex/pairs/solana/${pool}`)) {
      return new Response(JSON.stringify({ pairs: [{ baseToken: { address: held } }] }), { status: 200 });
    }
    if (target.includes('geckoterminal')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  try {
    const token = await fetchMint(pool, Date.now(), true);
    assert.equal(token.mint, held, 'the token the pool holds is the real identity');
    assert.equal(token.symbol, 'SAINDRA');
    assert.equal(token.liquiditySol, 100.25, 'the SOL-side reserve is retained when DEX Screener publishes it');
    assert.ok(calls.some(call => call.includes('/latest/dex/pairs/solana/')), 'the pair endpoint is what maps pool to token');
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('a list row never follows a pool address, so it cannot pick up another coin', async () => {
  const oldFetch = globalThis.fetch;
  const pool = 'ErrPZe43BFZqg9pyN5VPUwjTe5h7Dy5Fp7QZ9tKoxw';
  const held = 'A2yA6AFtfKkfVkfsnGpvsKoUV5kQPpMYboZsBPvmkA9T';
  let pairEndpointCalled = false;
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes('/latest/dex/pairs/')) { pairEndpointCalled = true; return new Response('{}', { status: 200 }); }
    if (target.includes('/token-pairs/v1/solana/')) return new Response('[]', { status: 200 });
    if (target.includes('geckoterminal')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  try {
    const token = await fetchMint(pool, Date.now(), false);
    assert.equal(token.mint, pool, 'without the flag the address keeps its own identity');
    assert.equal(isUnidentifiedToken(token), true);
    assert.equal(pairEndpointCalled, false, 'a row must not spend a request on pool resolution');
    assert.equal(held.length, 44);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('GeckoTerminal token-pools parser maps market and pool fields', () => {
  const now = Date.now();
  const token = parseGeckoTokenPools(payload(now), mint, now);
  assert.ok(token);
  assert.equal(token.provider, 'GeckoTerminal token pools');
  assert.equal(token.dexName, 'raydium');
  assert.equal(token.quoteSymbol, 'SOL');
  assert.equal(token.liquidityUsd, 20000);
  assert.equal(token.liquiditySol, null, 'the Gecko pool endpoint does not publish an exact quote reserve');
  assert.equal(token.priceUsd, 0.001);
  assert.equal(token.marketCapUsd, 50000);
  assert.equal(token.marketSnapshot.buys5m, 10);
  assert.equal(token.marketSnapshot.buyers5m, 8);
  assert.deepEqual(token.poolAddresses, [pool]);
  assert.equal(parseGeckoTokenPools({ data: [] }, mint, now), null);
});

test('fetchMint falls back to GeckoTerminal when DexScreener has no pool', async () => {
  const previous = globalThis.fetch;
  const now = Date.now();
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (String(url).includes('dexscreener')) return new Response(JSON.stringify([]), { status: 200 });
    return new Response(JSON.stringify(payload(now)), { status: 200 });
  };
  try {
    const token = await fetchMint(mint, now);
    assert.equal(token.provider, 'GeckoTerminal token pools');
    assert.equal(token.liquidityUsd, 20000);
    assert.ok(calls.some(url => url.includes('dexscreener')));
    assert.ok(calls.some(url => url.includes('geckoterminal')));
  } finally { globalThis.fetch = previous; }
});
