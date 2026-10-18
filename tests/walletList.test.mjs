import test from 'node:test';
import assert from 'node:assert/strict';
import { exportWalletList, parseWalletList } from '../dist/src/walletList.js';

const first = '4hZM2UfnTzCsaEUuFdRZ1YVgNEF8ChTcNbWfaiq3me3d';
const second = 'BT2sdwJeDWqXNUNBJwtKWBD7RjquACfjo1rT9vpZLUSA';

test('Axiom wallet exports become one flat list without groups', () => {
  const wallets = parseWalletList([
    { trackedWalletAddress: first, name: 'paradise1', groups: ['Main'] },
    { trackedWalletAddress: second, name: 'fwog dev', emoji: 'frog', groups: ['Main', 'Default'], alertsOnFeed: true }
  ]);
  assert.equal(wallets.length, 2);
  assert.equal('groups' in wallets[0], false);
  assert.equal(wallets[0].developer, false);
  assert.equal(wallets[1].developer, true);
  assert.equal(wallets[1].alertsOnFeed, true);
});

test('wallet import rejects invalid addresses and deduplicates by address', () => {
  const wallets = parseWalletList([
    { trackedWalletAddress: 'not-a-wallet', name: 'bad' },
    { trackedWalletAddress: first, name: 'first' },
    { trackedWalletAddress: first, name: 'duplicate dev' }
  ]);
  assert.deepEqual(wallets.map(wallet => wallet.name), ['first']);
});

test('wallet export is portable JSON and never restores groups', () => {
  const wallets = parseWalletList([{ trackedWalletAddress: second, name: 'fwog dev', groups: ['Main'], alertsOnToast: true }]);
  const exported = JSON.parse(exportWalletList(wallets));
  assert.deepEqual(exported, [{
    trackedWalletAddress: second,
    name: 'fwog dev',
    emoji: '',
    alertsOnToast: true,
    alertsOnBubble: false,
    alertsOnFeed: false
  }]);
  assert.equal('groups' in exported[0], false);
});
