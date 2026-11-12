import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const donation = {
  id: 'donation-1', farmerName: 'Cebu Farm', productName: 'Cabbage',
  status: 'scheduled', quantity: 5, availableQuantity: 5,
};

async function screen(file, mutation, reject = false, claimQuantity = '1', donations = [donation]) {
  const source = (await readFile(new URL(`../src/features/stakeholder/${file}.jsx`, import.meta.url), 'utf8'))
    .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace('export default ', '');
  const { code } = await transformWithOxc(source, `${file}.jsx`, { jsx: { runtime: 'classic' } });
  const values = [];
  const events = [];
  let finish;
  const pending = new Promise((resolve, fail) => { finish = () => reject ? fail(new Error('Request failed')) : resolve(donation); });
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState(initial) {
      const i = values.length;
      const state = file === 'StakeholderDonations' && i === 3 ? { [donation.id]: claimQuantity } : initial;
      values.push(state);
      return [state, (value) => { values[i] = typeof value === 'function' ? value(values[i]) : value; }];
    },
    useEffect: () => {},
    useLocation: () => ({ search: '' }),
    useAuth: () => ({ currentUser: { id: 'stakeholder-1', verificationStatus: 'verified' } }),
    useDonationList: () => ({ donations, loading: false, loadError: '', reload: async () => { events.push('reload'); } }),
    useStakeholderDonationPickupSharingContext: () => null,
    resolveDonationPickupStatus: (record) => record?.pickupStatus || 'scheduled',
    [mutation]: async (...args) => { events.push(args); return pending; },
    AppShell: 'shell', DonationCard: 'donation', Button: 'button', EmptyState: 'empty', StarRating: 'stars', Link: 'link',
    Gift: 'gift', Calendar: 'calendar', CheckCircle2: 'check', History: 'history', Hourglass: 'hourglass', MessageCircle: 'msg', Navigation: 'nav', stakeholderNavItems: [],
  };
  const component = new Function('scope', `with(scope){${code};return ${file};}`)(scope);
  const tree = component();
  function findCard(node, donationId) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'donation' && node.props.actions && node.props.donation.id === donationId) return node;
    for (const child of (node.props?.children || []).flat(Infinity)) {
      const found = findCard(child, donationId);
      if (found) return found;
    }
    return null;
  }
  return { values, events, finish, click: (donationId = donation.id) => findCard(tree, donationId).props.actions.props.onClick() };
}

for (const [file, mutation] of [['StakeholderDonations', 'requestDonation'], ['StakeholderRequests', 'confirmReceipt']]) {
  test(`${file} waits for the shared API before reporting success`, async () => {
    const page = await screen(file, mutation);
    const operation = page.click();
    assert.deepEqual(page.events, file === 'StakeholderDonations' ? [[donation.id, 1]] : [[donation.id]]);
    assert.equal(page.values[1], '');
    page.finish();
    await operation;
    assert.match(page.values[1], /Request sent|marked as received/);
    assert.equal(page.events.at(-1), 'reload');
    assert.equal(page.values[0], false);
  });

  test(`${file} reports failed writes without a false success`, async () => {
    const page = await screen(file, mutation, true);
    const operation = page.click();
    page.finish();
    await operation;
    assert.equal(page.values[1], '');
    assert.equal(file === 'StakeholderDonations' ? page.values[2][donation.id] : page.values[2], 'Request failed');
    assert.equal(page.events.length, 1);
  });
}

test('donation requests require a non-empty quantity greater than zero', async () => {
  for (const claimQuantity of ['', '0']) {
    const page = await screen('StakeholderDonations', 'requestDonation', false, claimQuantity);
    await page.click();
    assert.deepEqual(page.events, []);
    assert.match(page.values[2][donation.id], claimQuantity === '' ? /Enter the amount you need/ : /greater than 0/);
  }
});

test('quantity errors are stored and rendered by the individual donation card', async () => {
  const secondDonation = { ...donation, id: 'donation-2', productName: 'Tomato' };
  const page = await screen('StakeholderDonations', 'requestDonation', false, '', [donation, secondDonation]);

  await page.click(donation.id);
  await page.click(secondDonation.id);

  assert.deepEqual(Object.keys(page.values[2]).sort(), [donation.id, secondDonation.id].sort());
  assert.match(page.values[2][donation.id], /Enter the amount you need/);
  assert.match(page.values[2][secondDonation.id], /Enter the amount you need/);
});

test('donation service uses the authenticated API for every handoff', async () => {
  const source = (await readFile(new URL('../src/services/donationService.js', import.meta.url), 'utf8'))
    .replace(/import[^;]+;/g, '').replace(/export /g, '');
  const calls = [];
  const apiClient = Object.fromEntries(['get', 'post'].map((method) => [method, async (...args) => { calls.push([method, ...args]); return []; }]));
  const service = new Function('apiClient', `${source}; return { getAvailableDonations, getDonationsForStakeholder, createDonation, requestDonation, confirmReceipt };`)(apiClient);
  await service.getAvailableDonations();
  await service.getDonationsForStakeholder('org-1');
  await service.createDonation({ id: 'product-1', quantity: 999 }, { id: 'forged-farmer' });
  assert.throws(() => service.requestDonation('donation-1'), /Enter a positive donation quantity/);
  assert.throws(() => service.requestDonation('donation-1', ''), /Enter a positive donation quantity/);
  assert.throws(() => service.requestDonation('donation-1', 0), /Enter a positive donation quantity/);
  await service.requestDonation('donation-1', 2.5);
  await service.confirmReceipt('donation-1');
  assert.deepEqual(calls, [
    ['get', '/donations?status=available'], ['get', '/donations?stakeholderId=org-1'],
    ['post', '/donations', { productId: 'product-1' }],
    ['post', '/donations/donation-1/claims', { quantity: 2.5 }], ['post', '/donations/donation-1/receive', {}],
  ]);
});
