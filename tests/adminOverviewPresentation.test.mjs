import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';
import { getTotalRevenue } from '../src/services/reportService.js';

test('admin overview metrics use legible restrained system typography', async () => {
  const css = await readFile(new URL('../src/features/admin/AdminOverview.css', import.meta.url), 'utf8');
  assert.match(css, /\.admin-overview-page \{[\s\S]*?--font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif/);
  assert.match(css, /\.overview-metric strong \{[^}]*font-size: 29px;[^}]*font-weight: 600;[^}]*line-height: 1\.2;[^}]*font-variant-numeric: lining-nums tabular-nums/);
  assert.match(css, /\.overview-metric span \{[^}]*font-size: 14px;[^}]*font-weight: 500;[^}]*line-height: 1\.45/);
  assert.match(css, /@container \(max-width: 450px\)[\s\S]*?\.overview-metric strong \{ font-size: 26px;/);
});

test('admin dashboard polish preserves totals, review destinations, recent orders and activity', async () => {
  const original = await readFile(new URL('../src/features/admin/AdminOverview.jsx', import.meta.url), 'utf8');
  const source = original.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace(/import\s+['"][^'"]+['"];?/g, '').replace('export default ', '');
  const { code } = await transformWithOxc(source, 'AdminOverview.jsx', { jsx: { runtime: 'classic' } });
  const users = [{ id: 'u1', role: 'buyer', name: 'Buyer One', verificationStatus: 'pending', createdAt: '2026-10-01' }];
  const orders = [{ id: 'o1', buyerName: 'Buyer One', productName: 'Cabbage', totalAmount: 150, paymentStatus: 'paid', status: 'completed', createdAt: '2026-10-02' }];
  const donations = [{ id: 'd1', status: 'completed', productName: 'Carrot', createdAt: '2026-10-03' }, { id: 'd2', status: 'available' }, { id: 'd3', status: 'scheduled' }];
  const priceOverrides = [{ commodityId: 'c1', commodityLabel: 'Cabbage', updatedAt: '2026-10-04' }];
  const data = { users, orders, products: [{ status: 'active', name: 'Cabbage' }], pendingPriceReviews: [{ id: 'p1' }], priceOverrides };
  const state = [];
  let stateCursor = 0;
  const scope = { React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) }, useState: (initial) => {
    const index = stateCursor++;
    if (!(index in state)) state[index] = typeof initial === 'object' ? data : initial;
    return [state[index], (value) => { state[index] = value; }];
  }, useEffect() {}, useMemo: (fn) => fn(), useAuth: () => ({ currentUser: { role: 'admin' } }), useDonationList: () => ({ donations, loading: false, loadError: '' }), getTotalRevenue, formatCurrency: (value) => `PHP ${value}`, formatDateTimeManila: (at) => `Manila ${at}`, matchCommodity: () => true, MARKET_COMMODITIES: [{ id: 'c1' }], adminNavItems: [] };
  for (const name of ['AppShell', 'Link', 'PageHeader', 'Card', 'CardHeader', 'Modal', 'Table', 'EmptyState', 'LoadingState', 'BadgeAlert', 'ClipboardList', 'Gift', 'PackageCheck', 'Tag', 'ThemeToggle', 'TrendingUp', 'UserPlus', 'Users']) scope[name] = name;
  const { Page, ActivityRow } = new Function('scope', `with(scope){${code};return {Page: AdminOverview, ActivityRow};}`)(scope);
  const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : [tree, ...[...(tree.props?.children || []), tree.props?.action].flat(Infinity).flatMap(nodes)];
  const renderPage = () => { stateCursor = 0; return nodes(Page()); };
  const all = renderPage();
  assert.deepEqual(all.filter((node) => node.props.label && typeof node.props.value !== 'undefined').map((node) => [node.props.label, node.props.value]), [['Total sales', 'PHP 150'], ['Total orders', 1], ['Registered users', 1], ['Donations completed', 1], ['PSA commodities', 1], ['Farmer listings', 1], ['Price alerts', 1], ['Overridden prices', 1], ['Completed', 1], ['Pending', 1], ['Available', 1]]);
  assert.deepEqual(all.filter((node) => node.props.to).map((node) => node.props.to), ['/admin-users', '/admin-price-monitoring', '/admin-orders', '/admin-price-monitoring', '/admin-donations']);
  assert.deepEqual(all.find((node) => node.type === 'Table').props.rows, orders.slice(0, 5));
  assert.deepEqual(all.filter((node) => node.props.message && node.props.at).slice(0, 4).map((node) => [node.props.message, node.props.at]), [['Price updated: Cabbage', '2026-10-04'], ['Donation completed: Carrot', '2026-10-03'], ['Order completed: Cabbage for Buyer One', '2026-10-02'], ['New buyer registered: Buyer One', '2026-10-01']]);
  const activityRows = all.filter((node) => node.type === ActivityRow).slice(0, 4).map((node) => ActivityRow(node.props));
  const times = activityRows.flatMap((row) => nodes(row)).filter((node) => node.type === 'time');
  assert.deepEqual(times.map((node) => [node.props.dateTime, node.props.children[0]]), [
    ['2026-10-04', 'Manila 2026-10-04'],
    ['2026-10-03', 'Manila 2026-10-03'],
    ['2026-10-02', 'Manila 2026-10-02'],
    ['2026-10-01', 'Manila 2026-10-01'],
  ]);
  const viewMore = all.find((node) => node.type === 'button' && node.props.children[0] === 'View more');
  assert.ok(viewMore);
  viewMore.props.onClick();
  const openModal = renderPage().find((node) => node.type === 'Modal');
  assert.equal(openModal.props.open, true);
  assert.equal(openModal.props.dialogLabel, 'All recent activity');
  assert.equal(nodes(openModal).filter((node) => node.type === ActivityRow).length, 4);
});
