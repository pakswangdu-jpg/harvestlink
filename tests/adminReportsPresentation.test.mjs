import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';
import * as reports from '../src/services/reportService.js';

const element = (type, props, ...children) => ({ type, props: { ...props, children } });
const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];

async function compile(file, name, scope) {
  const original = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
  const source = original.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace(/import\s+['"][^'"]+['"];?/g, '').replace('export default ', '');
  const { code } = await transformWithOxc(source, file, { jsx: { runtime: 'classic' } });
  return new Function('scope', `with(scope){${code};return ${name};}`)({ React: { createElement: element }, ...scope });
}

test('admin reports retains dynamic totals, chart records and product table data', async () => {
  const orders = [{ id: 'o1', productId: 'p1', productName: 'Cabbage', farmerName: 'Farmer', unit: 'kg', quantity: 2, totalAmount: 150, paymentStatus: 'paid', status: 'completed', createdAt: '2026-10-01' }];
  const users = [{ id: 'u1', role: 'farmer', createdAt: '2026-10-01' }, { id: 'u2', role: 'buyer', createdAt: '2026-10-01' }];
  const donations = [{ id: 'd1', status: 'available', createdAt: '2026-10-01' }, { id: 'd2', status: 'completed', createdAt: '2026-10-01' }];
  const scope = { ...reports, useState: (initial) => [initial === null ? { orders, users } : initial, () => {}], useEffect() {}, useAuth: () => ({ currentUser: { role: 'admin' } }), useDonationList: () => ({ donations, loading: false, loadError: '' }), formatCurrency: (value) => `PHP ${value}`, donationStatusLabel: (value) => value, adminNavItems: [] };
  for (const name of ['AppShell', 'PageHeader', 'Card', 'CardHeader', 'Table', 'EmptyState', 'LoadingState', 'RevenueTrendChart', 'StatusDistributionChart', 'TrendingUp', 'ClipboardList', 'Users', 'Gift']) scope[name] = name;
  const Page = await compile('features/admin/AdminReports.jsx', 'AdminReports', scope);
  const all = nodes(Page());
  assert.deepEqual(all.filter((node) => node.props.label).map((node) => [node.props.label, node.props.value]), [['Total sales', 'PHP 150'], ['Total orders', 1], ['Registered users', 2], ['Donations completed', 1]]);
  assert.deepEqual(all.find((node) => node.type === 'RevenueTrendChart').props.points, reports.getReportRevenue(orders, '6m'));
  const charts = all.filter((node) => node.type === 'StatusDistributionChart');
  assert.deepEqual(charts[0].props.records, orders);
  assert.deepEqual(charts[1].props.records, donations);
  assert.deepEqual(charts[2].props.records, users);
  assert.ok(charts.every((chart) => chart.props.hidePeriodFilter));
  assert.equal(charts[0].props.computeBreakdown(orders)[0].count, 1);
  assert.deepEqual(all.find((node) => node.type === 'Table').props.rows, reports.getTopProducts(orders, 10).map((row) => ({ ...row, id: row.productId })));
});

test('report chart styling preserves the All time and monthly filter behavior', async () => {
  const values = [];
  let index = 0;
  const scope = { useState(initial) { const slot = index++; if (!(slot in values)) values[slot] = initial; return [values[slot], (value) => { values[slot] = value; }]; }, useMemo: (fn) => fn() };
  for (const name of ['Bar', 'BarChart', 'CartesianGrid', 'Cell', 'LabelList', 'ResponsiveContainer', 'Tooltip', 'XAxis', 'Select', 'EmptyState']) scope[name] = name;
  const Chart = await compile('components/charts/StatusDistributionChart.jsx', 'StatusDistributionChart', scope);
  const records = [{ createdAt: '2026-09-01', status: 'pending' }, { createdAt: '2026-10-01', status: 'completed' }];
  const props = { records, presentation: 'report', title: 'Orders by status', computeBreakdown: (rows) => rows.map((row) => ({ key: row.status, status: row.status, label: row.status, count: 1 })) };
  const render = () => { index = 0; return nodes(Chart(props)); };
  const first = render();
  assert.equal(first.find((node) => node.type === 'Select').props.value, 'all');
  assert.equal(first.find((node) => node.type === 'BarChart').props.data.length, 2);
  first.find((node) => node.type === 'Select').props.onChange({ target: { value: '2026-09' } });
  const filtered = render();
  assert.deepEqual(filtered.find((node) => node.type === 'BarChart').props.data.map((row) => row.status), ['completed']);
  filtered.find((node) => node.type === 'Select').props.onChange({ target: { value: 'all' } });
  assert.equal(render().find((node) => node.type === 'BarChart').props.data.length, 2);
});

test('one report-period control updates every chart, summary and product ranking together', async () => {
  const recent = new Date(Date.now() - 86400000).toISOString();
  const older = new Date(Date.now() - 70 * 86400000).toISOString();
  const orders = [{ id: 'o1', productId: 'p1', productName: 'Cabbage', farmerName: 'Farmer', quantity: 2, totalAmount: 150, paymentStatus: 'paid', status: 'completed', createdAt: recent }, { id: 'o2', productId: 'p2', productName: 'Carrots', quantity: 3, totalAmount: 300, paymentStatus: 'paid', status: 'confirmed', createdAt: older }];
  const users = [{ role: 'farmer', createdAt: recent }, { role: 'buyer', createdAt: older }];
  const donations = [{ status: 'completed', createdAt: recent }, { status: 'completed', createdAt: older }];
  const values = [{ orders, users }, '', '6m', 0];
  let index = 0;
  const scope = { ...reports, useState: () => { const slot = index++; return [values[slot], (value) => { values[slot] = value; }]; }, useEffect() {}, useAuth: () => ({ currentUser: { role: 'admin' } }), useDonationList: () => ({ donations, loading: false, loadError: '' }), formatCurrency: (value) => `PHP ${value}`, donationStatusLabel: (value) => value, adminNavItems: [] };
  for (const name of ['AppShell','PageHeader','Card','CardHeader','Table','EmptyState','LoadingState','RevenueTrendChart','StatusDistributionChart','TrendingUp','ClipboardList','Users','Gift']) scope[name] = name;
  const Page = await compile('features/admin/AdminReports.jsx', 'AdminReports', scope);
  const render = () => { index = 0; return nodes(Page()); };
  const first = render();
  first.find((node) => node.type === 'select').props.onChange({ target: { value: '7d' } });
  const filtered = render();
  assert.deepEqual(filtered.filter((node) => node.props.label).map((node) => [node.props.label,node.props.value]), [['Total sales','PHP 150'],['Total orders',1],['Registered users',1],['Donations completed',1]]);
  assert.equal(filtered.find((node) => node.type === 'RevenueTrendChart').props.points.length,7);
  assert.ok(filtered.filter((node) => node.type === 'StatusDistributionChart').every((node) => node.props.records.length === 1));
  assert.equal(filtered.find((node) => node.type === 'Table').props.rows[0].productId,'p1');
  assert.equal(filtered.find((node) => node.type === 'Table').props.rows.length,1);
  assert.equal(orders.length,2);
});
