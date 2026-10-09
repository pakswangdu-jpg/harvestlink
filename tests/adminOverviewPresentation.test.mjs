import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';
import { getTotalRevenue } from '../src/services/reportService.js';

test('admin dashboard polish preserves totals, review destinations, recent orders and activity', async () => {
  const original = await readFile(new URL('../src/features/admin/AdminOverview.jsx', import.meta.url), 'utf8');
  const source = original.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace(/import\s+['"][^'"]+['"];?/g, '').replace('export default ', '');
  const { code } = await transformWithOxc(source, 'AdminOverview.jsx', { jsx: { runtime: 'classic' } });
  const users = [{ id: 'u1', role: 'buyer', name: 'Buyer One', verificationStatus: 'pending', createdAt: '2026-10-01' }];
  const orders = [{ id: 'o1', buyerName: 'Buyer One', productName: 'Cabbage', totalAmount: 150, paymentStatus: 'paid', status: 'completed', createdAt: '2026-10-02' }];
  const donations = [{ id: 'd1', status: 'completed', productName: 'Carrot', createdAt: '2026-10-03' }, { id: 'd2', status: 'available' }, { id: 'd3', status: 'scheduled' }];
  const priceOverrides = [{ commodityId: 'c1', commodityLabel: 'Cabbage', updatedAt: '2026-10-04' }];
  const data = { users, orders, products: [{ status: 'active', name: 'Cabbage' }], pendingPriceReviews: [{ id: 'p1' }], priceOverrides };
  const scope = { React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) }, useState: (initial) => [typeof initial === 'object' ? data : initial, () => {}], useEffect() {}, useMemo: (fn) => fn(), useAuth: () => ({ currentUser: { role: 'admin' } }), useDonationList: () => ({ donations, loading: false, loadError: '' }), getTotalRevenue, formatCurrency: (value) => `PHP ${value}`, formatRelativeTime: (at) => at, matchCommodity: () => true, MARKET_COMMODITIES: [{ id: 'c1' }], adminNavItems: [] };
  for (const name of ['AppShell', 'Link', 'PageHeader', 'Card', 'CardHeader', 'Table', 'EmptyState', 'LoadingState', 'BadgeAlert', 'ClipboardList', 'Gift', 'PackageCheck', 'Tag', 'TrendingUp', 'UserPlus', 'Users']) scope[name] = name;
  const Page = new Function('scope', `with(scope){${code};return AdminOverview;}`)(scope);
  const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : [tree, ...[...(tree.props?.children || []), tree.props?.action].flat(Infinity).flatMap(nodes)];
  const all = nodes(Page());
  assert.deepEqual(all.filter((node) => node.props.label && typeof node.props.value !== 'undefined').map((node) => [node.props.label, node.props.value]), [['Total sales', 'PHP 150'], ['Total orders', 1], ['Registered users', 1], ['Donations completed', 1], ['PSA commodities', 1], ['Farmer listings', 1], ['Price alerts', 1], ['Overridden prices', 1], ['Completed', 1], ['Pending', 1], ['Available', 1]]);
  assert.deepEqual(all.filter((node) => node.props.to).map((node) => node.props.to), ['/admin-users', '/admin-price-monitoring', '/admin-orders', '/admin-price-monitoring', '/admin-donations']);
  assert.deepEqual(all.find((node) => node.type === 'Table').props.rows, orders.slice(0, 5));
  assert.deepEqual(all.filter((node) => node.props.message && node.props.at).map((node) => [node.props.message, node.props.at]), [['Price updated: Cabbage', '2026-10-04'], ['Donation completed: Carrot', '2026-10-03'], ['Order completed: Cabbage for Buyer One', '2026-10-02'], ['New buyer registered: Buyer One', '2026-10-01']]);
});
