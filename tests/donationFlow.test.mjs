import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const donation = { id: 'donation-1', farmerName: 'Cebu Farm', productName: 'Cabbage', status: 'scheduled' };

async function screen(file, mutation, reject = false) {
  const source = (await readFile(new URL(`../src/features/stakeholder/${file}.jsx`, import.meta.url), 'utf8'))
    .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace('export default ', '');
  const { code } = await transformWithOxc(source, `${file}.jsx`, { jsx: { runtime: 'classic' } });
  const values = [];
  const events = [];
  let finish;
  const pending = new Promise((resolve, fail) => { finish = () => reject ? fail(new Error('Request failed')) : resolve(donation); });
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState(initial) { const i = values.length; values.push(initial); return [initial, (value) => { values[i] = value; }]; },
    useAuth: () => ({ currentUser: { id: 'stakeholder-1', verificationStatus: 'verified' } }),
    useDonationList: () => ({ donations: [donation], loading: false, loadError: '', reload: async () => { events.push('reload'); } }),
    [mutation]: async (...args) => { events.push(args); return pending; },
    AppShell: 'shell', DonationCard: 'donation', Button: 'button', EmptyState: 'empty', StarRating: 'stars',
    Gift: 'gift', Calendar: 'calendar', CheckCircle2: 'check', History: 'history', Hourglass: 'hourglass', stakeholderNavItems: [],
  };
  const component = new Function('scope', `with(scope){${code};return ${file};}`)(scope);
  const tree = component();
  function findCard(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'donation' && node.props.actions) return node;
    for (const child of (node.props?.children || []).flat(Infinity)) {
      const found = findCard(child);
      if (found) return found;
    }
    return null;
  }
  return { values, events, finish, click: () => findCard(tree).props.actions.props.onClick() };
}

for (const [file, mutation] of [['StakeholderDonations', 'requestDonation'], ['StakeholderRequests', 'confirmReceipt']]) {
  test(`${file} waits for the shared API before reporting success`, async () => {
    const page = await screen(file, mutation);
    const operation = page.click();
    assert.deepEqual(page.events, [[donation.id]]);
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
    assert.equal(page.values[2], 'Request failed');
    assert.equal(page.events.length, 1);
  });
}

test('donation service uses the authenticated API for every handoff', async () => {
  const source = (await readFile(new URL('../src/services/donationService.js', import.meta.url), 'utf8'))
    .replace(/import[^;]+;/g, '').replace(/export /g, '');
  const calls = [];
  const apiClient = Object.fromEntries(['get', 'post'].map((method) => [method, async (...args) => { calls.push([method, ...args]); return []; }]));
  const service = new Function('apiClient', `${source}; return { getAvailableDonations, getDonationsForStakeholder, createDonation, requestDonation, confirmReceipt };`)(apiClient);
  await service.getAvailableDonations();
  await service.getDonationsForStakeholder('org-1');
  await service.createDonation({ id: 'product-1', quantity: 999 }, { id: 'forged-farmer' });
  await service.requestDonation('donation-1', { id: 'forged-recipient' });
  await service.confirmReceipt('donation-1');
  assert.deepEqual(calls, [
    ['get', '/donations?status=available'], ['get', '/donations?stakeholderId=org-1'],
    ['post', '/donations', { productId: 'product-1' }],
    ['post', '/donations/donation-1/request', {}], ['post', '/donations/donation-1/receive', {}],
  ]);
});
