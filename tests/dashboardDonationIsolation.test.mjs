import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';
import * as reports from '../src/services/reportService.js';

const flush = () => new Promise((resolve) => setImmediate(resolve));
const products = [{ id: 'product-1', name: 'Cabbage', status: 'active' }];
const orders = [
  { id: 'order-1', status: 'pending', paymentStatus: 'paid', paymentMethod: 'gcash', totalAmount: 250, unitPrice: 50, unitCostPrice: 20, quantity: 5, createdAt: new Date().toISOString() },
  { id: 'order-2', status: 'confirmed', paymentStatus: 'pending', totalAmount: 100, createdAt: new Date().toISOString() },
];
const users = [{ id: 'farmer-1', name: 'John', role: 'farmer', verificationStatus: 'verified', createdAt: new Date().toISOString() }];
const donationFailure = { donations: [], loading: false, loadError: 'Donations are not configured yet. Please contact support.' };

async function harness(file, donationState = donationFailure) {
  const original = await readFile(new URL(`../src/features/${file}.jsx`, import.meta.url), 'utf8');
  const source = original.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace('export default ', '');
  const { code } = await transformWithOxc(source, `${file}.jsx`, { jsx: { runtime: 'classic' } });
  const componentName = file.split('/').at(-1);
  const scope = {};
  for (const match of original.matchAll(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)) {
    for (const name of match[1].replace(/[{}]/g, '').split(',').map((name) => name.trim()).filter(Boolean)) scope[name] = name;
  }
  const values = [];
  let index = 0;
  let effects = [];
  let mounted = false;
  let poll;
  let failCore = false;
  let cleanup;
  Object.assign(scope, reports, {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState(initial) {
      const slot = index++;
      if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial;
      return [values[slot], (next) => { values[slot] = typeof next === 'function' ? next(values[slot]) : next; }];
    },
    useEffect: (effect) => { if (!mounted) effects.push(effect); },
    useMemo: (compute) => compute(),
    useNavigate: () => () => {},
    useAuth: () => ({ currentUser: { ...users[0], municipality: 'Mandaue City' } }),
    useDonationList: () => donationState,
    setInterval: (callback) => { poll = callback; return 1; }, clearInterval() {},
    getProductsByFarmer: async () => { if (failCore) throw new Error('Products unavailable'); return products; },
    getProducts: async () => products,
    getOrdersByFarmer: async () => orders, getOrders: async () => orders,
    getUsers: async () => users, getVerifiedFarmers: async () => users,
    getBuyers: async () => [], getStakeholders: async () => [],
    getPendingPriceReviews: async () => [], getAllPriceOverrides: async () => [],
    nearestByMunicipality: (municipality, rows) => rows,
    matchCommodity: () => ({ id: '28' }), MARKET_COMMODITIES: [],
    formatCurrency: (number) => `PHP ${number.toFixed(2)}`,
    formatDate: () => 'Today', formatRelativeTime: () => 'Just now', getFirstName: (name) => name,
    donationStatusLabel: (status) => status,
  });
  const component = new Function('scope', `with(scope){${code};return ${componentName};}`)(scope);
  const render = () => { index = 0; return component(); };
  render();
  cleanup = effects.map((effect) => effect());
  mounted = true;
  effects = [];
  await flush();
  return {
    render, values,
    refresh: async () => { poll(); await flush(); },
    failCore: () => { failCore = true; },
    recoverDonations: () => { donationState = { donations: [{ id: 'donation-1', status: 'requested' }, { id: 'donation-2', status: 'completed' }], loading: false, loadError: '' }; },
    cleanup: () => cleanup.forEach((callback) => callback?.()),
  };
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];
}

for (const file of ['farmer/FarmerDashboard', 'admin/AdminOverview', 'admin/AdminReports']) {
  for (const [name, donationState] of [['failed', donationFailure], ['slow', { donations: [], loading: true, loadError: '' }]]) {
    test(`${file}: ${name} donations cannot block real sales, orders, or products`, async () => {
      const page = await harness(file, donationState);
      const tree = page.render();
      assert.deepEqual(page.values[0].orders, orders);
      const all = nodes(tree);
      if (file.startsWith('farmer')) {
        assert.deepEqual(page.values[0].products, products);
        const summary = all.find((node) => node.type === 'MetricsSummary').props;
        assert.equal(summary.financialMetrics[0].value, 'PHP 250.00');
        assert.equal(summary.financialMetrics[1].value, 'PHP 150.00');
        assert.equal(summary.productMetrics[0].value, 1);
        assert.equal(summary.orderMetrics[0].value, 1);
        assert.equal(summary.orderMetrics[1].value, 1);
      } else {
        assert.equal(all.find((node) => node.props.label === 'Total sales').props.value, 'PHP 250.00');
        assert.equal(all.find((node) => node.props.label === 'Total orders').props.value, 2);
      }
      const donationMetric = all.find((node) => ['Surplus donations', 'Donations completed'].includes(node.props.label));
      assert.equal(donationMetric.props.value, '--');
      if (name === 'failed') {
        assert.ok(all.some((node) => node.props.role === 'alert' && node.props.className === 'form-alert warning'));
        assert.ok(!all.some((node) => node.props.role === 'alert' && node.props.className === 'form-alert error'));
      }
      page.recoverDonations();
      const recovered = nodes(page.render()).find((node) => ['Surplus donations', 'Donations completed'].includes(node.props.label));
      assert.equal(recovered.props.value, 1);
      page.cleanup();
    });
  }
}

test('farmer dashboard preserves last successful business data if a later core refresh fails', async () => {
  const page = await harness('farmer/FarmerDashboard');
  page.failCore();
  await page.refresh();
  assert.deepEqual(page.values[0].orders, orders);
  assert.deepEqual(page.values[0].products, products);
  assert.equal(page.values[1], 'Products unavailable');
  page.cleanup();
});
