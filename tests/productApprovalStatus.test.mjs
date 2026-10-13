import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';
import { getProductApprovalStatus, getProductListingStatusInfo, getProductStatusInfo } from '../src/utils/constants.js';

const product = { id: 'eggplant', name: 'Eggplant', status: 'active', quantity: 50, price: 171, grade: 'B', unit: 'kg' };

test('Pending approval and rejection take priority without mutating listing or stock data', () => {
  for (const status of ['active', 'inactive']) for (const quantity of [0, 5, 50]) {
    const pending = { ...product, status, quantity, priceReview: { status: 'pending' } };
    const original = structuredClone(pending);
    assert.equal(getProductApprovalStatus(pending), 'pending');
    assert.deepEqual(getProductStatusInfo(pending), { value: 'pending-approval', label: 'Pending approval' });
    assert.deepEqual(pending, original);
    assert.deepEqual(getProductStatusInfo({ ...pending, priceReview: { status: 'declined' } }), { value: 'rejected', label: 'Rejected' });
  }
});

test('Approval returns to the existing stock and listing status without altering legacy products', () => {
  for (const review of [null, { status: 'approved' }]) {
    for (const [status, quantity, expected] of [['active', 50, 'active'], ['active', 5, 'low-stock'], ['active', 0, 'out-of-stock'], ['inactive', 50, 'inactive']]) {
      const row = { ...product, status, quantity, priceReview: review };
      assert.equal(getProductApprovalStatus(row), 'approved');
      assert.equal(getProductStatusInfo(row).value, expected);
      assert.deepEqual(getProductStatusInfo(row), getProductListingStatusInfo(row));
    }
  }
});

test('Status filter counts and matching include pending and rejected states', async () => {
  const source = await readFile(new URL('../src/features/farmer/FarmerProducts.jsx', import.meta.url), 'utf8');
  const tabsCode = source.slice(source.indexOf('const STATUS_TABS'), source.indexOf('function buildDuplicatePayload'));
  const tabs = new Function(`${tabsCode};return STATUS_TABS;`)();
  assert.ok(tabs.some((tab) => tab.value === 'pending-approval' && tab.label === 'Pending approval'));
  assert.ok(tabs.some((tab) => tab.value === 'rejected'));
  const rows = [product, { ...product, priceReview: { status: 'pending' } }, { ...product, priceReview: { status: 'declined' }, status: 'inactive' }];
  const countsCode = source.slice(source.indexOf('const statusTabs ='), source.indexOf('const visibleProducts ='));
  const statusTabs = new Function('products', 'STATUS_TABS', 'getProductStatusInfo', 'useMemo', `${countsCode};return statusTabs;`)(rows, tabs, getProductStatusInfo, (fn) => fn());
  assert.equal(statusTabs.find((tab) => tab.value === 'active').count, 1);
  assert.equal(statusTabs.find((tab) => tab.value === 'pending-approval').count, 1);
  assert.equal(statusTabs.find((tab) => tab.value === 'rejected').count, 1);
  assert.match(source, /getProductStatusInfo\(product\)\.value === statusFilter/);
});

test('View reason appears only for an existing rejection reason, never the automatic pricing flag', async () => {
  const source = await readFile(new URL('../src/components/products/ProductStatusBadge.jsx', import.meta.url), 'utf8');
  const { code } = await transformWithOxc(source.replace(/import .*?;\s*/g, '').replace('export default ', ''), 'ProductStatusBadge.jsx', { jsx: { runtime: 'classic' } });
  const Badge = new Function('React', 'getProductStatusInfo', `${code};return ProductStatusBadge;`)({ createElement: (type, props, ...children) => ({ type, props, children }) }, getProductStatusInfo);
  const declined = { ...product, priceReview: { status: 'declined', reason: 'Above reference price' } };
  assert.ok(Badge({ product: declined }).children.every((child) => child?.type !== 'details'));
  const withReason = Badge({ product: { ...declined, priceReview: { ...declined.priceReview, declineReason: 'Please correct the price.' } } });
  const details = withReason.children.find((child) => child?.type === 'details');
  assert.equal(details.children[0].children[0], 'View reason');
  assert.equal(details.children[1].children[0], 'Please correct the price.');
});

test('Adjustment is separate from rejection and takes priority over stock status', () => {
  const row = { ...product, status: 'inactive', priceReview: { status: 'needs_adjustment', maxAllowedPrice: 150, reviewUnit: 'kg' } };
  assert.equal(getProductApprovalStatus(row), 'needs-adjustment');
  assert.deepEqual(getProductStatusInfo(row), { value: 'needs-adjustment', label: 'Needs price adjustment' });
  assert.equal(getProductListingStatusInfo(row).value, 'inactive');
});
