import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = (await readFile(new URL('../src/hooks/useDonationList.js', import.meta.url), 'utf8'))
  .replace(/import[^;]+;/g, '').replace('export ', '');
const flush = () => new Promise((resolve) => setImmediate(resolve));

function harness() {
  const values = [];
  const requests = [];
  let effect;
  let poll;
  const load = () => new Promise((resolve, reject) => requests.push({ resolve, reject }));
  const scope = {
    useCallback: (callback) => callback,
    useRef: (value) => ({ current: value }),
    useState(value) { const i = values.length; values.push(value); return [value, (next) => { values[i] = next; }]; },
    useEffect: (callback) => { effect = callback; },
    setInterval: (callback) => { poll = callback; return 1; }, clearInterval() {},
    getAvailableDonations: load, getDonations: load, getDonationsByFarmer: load, getDonationsForStakeholder: load,
  };
  const hook = new Function('scope', `with(scope){${source};return useDonationList;}`)(scope);
  const result = hook({ availableOnly: true });
  const cleanup = effect();
  return { values, requests, result, cleanup, poll: () => poll() };
}

test('slow donation requests finish without overlapping polls superseding them', async () => {
  const page = harness();
  page.poll(); page.poll(); page.poll();
  assert.equal(page.requests.length, 1);
  const donations = [{ id: 'shared-donation' }];
  page.requests[0].resolve(donations);
  await flush();
  assert.deepEqual(page.values, [donations, false, '']);
  page.poll();
  assert.equal(page.requests.length, 2);
  page.cleanup();
  page.requests[1].resolve([]);
  await flush();
  assert.deepEqual(page.values[0], donations);
});

test('manual refresh after a write supersedes an older in-flight list', async () => {
  const page = harness();
  const refresh = page.result.reload();
  page.requests[1].resolve([{ id: 'new-state' }]);
  await refresh;
  page.requests[0].resolve([{ id: 'old-state' }]);
  await flush();
  assert.equal(page.values[0][0].id, 'new-state');
  page.cleanup();
});

test('donation loading errors are visible and a later poll can recover', async () => {
  const page = harness();
  page.requests[0].reject(new Error('Donations are not configured yet.'));
  await flush();
  assert.equal(page.values[1], false);
  assert.match(page.values[2], /not configured/);
  page.poll();
  page.requests[1].resolve([{ id: 'shared-donation' }]);
  await flush();
  assert.equal(page.values[2], '');
  assert.equal(page.values[0].length, 1);
  page.cleanup();
});
