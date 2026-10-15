import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { assessTokens } from '../dist/src/analysis.js';
import { fetchTokens } from '../dist/src/provider.js';
import { defaults } from '../dist/src/settings.js';
import {
  filterByPlatform, loadPlatformFilter, matchesPlatform, platformCatalogue, platformLabel, platformOf,
  platformOptions, savePlatformFilter, togglePlatform, unknownPlatformId, validPlatformIds
} from '../dist/src/platformFilter.js';

const mints = [
  '11111111111111111111111111111111',
  '22222222222222222222222222222222',
  '33333333333333333333333333333333',
  '44444444444444444444444444444444'
];

const base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** A distinct base58-valid 32 character mint for any index, so long fixtures stay unique. */
function mintAt(index) {
  if (mints[index]) return mints[index];
  let value = index;
  let text = '';
  while (text.length < 32) {
    text = base58[value % base58.length] + text;
    value = Math.floor(value / base58.length) + 7;
  }
  return text;
}

async function sample(dexes) {
  const now = Date.now();
  const [base] = await fetchTokens('demo', now);
  const tokens = dexes.map((dexName, index) => ({ ...base, mint: mintAt(index), dexName, provider: 'Verified fixture' }));
  return assessTokens(tokens, defaults, now);
}

test('the platform key comes from the pool DEX the feed reported', async () => {
  const [raydium, pumpfun, none, alias] = await sample(['raydium', 'pumpfun', undefined, 'raydium-launchlab']);
  assert.equal(platformOf(raydium), 'raydium');
  assert.equal(platformOf(pumpfun), 'pumpfun');
  assert.equal(platformOf(none), unknownPlatformId, 'a feed without a DEX lands in the unknown bucket');
  assert.equal(platformOf(alias), 'launchlab', 'Raydium LaunchLab is its own launchpad, not the Raydium AMM');
  assert.equal(platformLabel('raydium-launchlab'), 'Raydium Launchlab');
  assert.equal(platformLabel(unknownPlatformId), 'Unknown platform');
});

test('every launchpad Axiom lists is named, and the near-misses stay apart', async () => {
  const dexes = [
    'pumpfun', 'pumpswap', 'raydium', 'raydium-launchlab', 'meteora', 'meteora-dbc', 'orca',
    'bonk', 'bonkers', 'liquid', 'liquidaf', 'moonshot', 'moonit', 'boop', 'believe', 'bags',
    'heaven', 'sugar', 'candle', 'mayhem', 'surge', 'soar', 'borderless', 'daos', 'printr',
    'riserich', 'stonkfun', 'usepaid', 'jupiter', 'pancakeswap'
  ];
  const assessments = await sample(dexes);
  assert.deepEqual(assessments.map(platformOf), [
    'pumpfun', 'pumpswap', 'raydium', 'launchlab', 'meteora', 'dynamicbc', 'orca',
    'bonk', 'bonkers', 'liquid', 'liquidaf', 'moonshot', 'moonit', 'boop', 'believe', 'bags',
    'heaven', 'sugar', 'candle', 'mayhem', 'surge', 'soar', 'borderless', 'daos', 'printr',
    'riserich', 'stonk', 'usepaid', 'jupiter', 'pancake'
  ], 'a substring never steals a neighbouring launchpad');
  assert.equal(new Set(assessments.map(platformOf)).size, dexes.length, 'every launchpad is distinct');
});

test('the catalogue offers every launchpad, with the ones on screen first', async () => {
  const assessments = await sample(['raydium', 'raydium', 'pumpfun', undefined]);
  const catalogue = platformCatalogue(assessments);
  const ids = catalogue.map(option => option.id);
  assert.deepEqual(ids.slice(0, 2), ['raydium', 'pumpfun'], 'platforms in this scan lead, in catalogue order');
  assert.ok(!ids.includes(unknownPlatformId), 'the unknown bucket is not a launchpad, so it gets no pill');
  assert.ok(ids.length > 20, 'the idle launchpads are still offered');
  assert.equal(new Set(ids).size, ids.length, 'no launchpad is listed twice');
  assert.equal(catalogue[0].count, 2);
  assert.equal(ids.slice(2).every(id => catalogue.find(o => o.id === id).count === 0), true, 'the rest carry a zero count');
  assert.ok(catalogue.every(option => option.mark.includes('<svg')), 'every pill gets a launchpad mark');
});

test('the option list counts only what is on screen, busiest first', async () => {
  const assessments = await sample(['raydium', 'raydium', 'pumpfun', undefined]);
  const options = platformOptions(assessments);
  assert.deepEqual(options.map(option => option.id), ['raydium', 'pumpfun', unknownPlatformId]);
  assert.deepEqual(options.map(option => option.count), [2, 1, 1]);
  assert.equal(options[0].label, 'Raydium');
  assert.match(options[0].color, /^#[0-9a-f]{6}$/i);
  assert.equal(options[1].label, 'pump.fun');
});

test('an empty selection means every launchpad, a selection means only those', async () => {
  const assessments = await sample(['raydium', 'pumpfun', 'meteora', 'orca']);
  assert.equal(filterByPlatform(assessments, []).length, 4);
  assert.deepEqual(filterByPlatform(assessments, ['pumpfun']).map(platformOf), ['pumpfun']);
  assert.deepEqual(filterByPlatform(assessments, ['raydium', 'orca']).map(platformOf), ['raydium', 'orca']);
  assert.equal(matchesPlatform(assessments[0], []), true);
  assert.equal(matchesPlatform(assessments[0], ['orca']), false);
  assert.deepEqual(filterByPlatform(assessments, ['unknown']), [], 'the unknown bucket only matches unlabelled coins');
});

test('the selection is validated, remembered and toggled', () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://scout.test/' });
  const original = globalThis.localStorage;
  globalThis.localStorage = dom.window.localStorage;
  try {
    assert.deepEqual(loadPlatformFilter(), [], 'nothing selected by default');
    savePlatformFilter(['raydium', 'pumpfun', 'raydium']);
    assert.deepEqual(loadPlatformFilter(), ['raydium', 'pumpfun']);

    dom.window.localStorage.setItem('scout.platforms.v1', JSON.stringify(['ok', 'bad id', 7, null, '<script>']));
    assert.deepEqual(loadPlatformFilter(), ['ok'], 'junk ids are dropped');
    dom.window.localStorage.setItem('scout.platforms.v1', '{not json');
    assert.deepEqual(loadPlatformFilter(), [], 'unreadable storage falls back to no filter');

    assert.deepEqual(validPlatformIds(Array.from({ length: 40 }, (_, index) => `p${index}`)).length, 24, 'the selection stays bounded');
    assert.deepEqual(togglePlatform([], 'raydium'), ['raydium']);
    assert.deepEqual(togglePlatform(['raydium', 'orca'], 'raydium'), ['orca']);
    assert.deepEqual(togglePlatform(['orca'], 'raydium'), ['orca', 'raydium']);
  } finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, 'localStorage');
    else globalThis.localStorage = original;
    dom.window.close();
  }
});
