import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const element = (type, props, ...children) => ({ type, props: { ...props, children } });
const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];

async function compile(scope) {
  const original = await readFile(new URL('../src/features/admin/AdminDonations.jsx', import.meta.url), 'utf8');
  const source = original.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace(/import\s+['"][^'"]+['"];?/g, '').replace('export default ', '');
  const { code } = await transformWithOxc(source, 'AdminDonations.jsx', { jsx: { runtime: 'classic' } });
  return new Function('scope', `with(scope){${code};return {AdminDonations, donationUrgency};}`)({ React: { createElement: element }, ...scope });
}

test('admin donations preserves row data and uses real counts, server filters and details actions', async () => {
  const row = { id: 'd1', productName: 'Cabbage', farmerName: 'Farmer', quantity: 4, unit: 'kg', status: 'available' };
  const slots = [{ search: '', status: '', from: '', to: '', page: 2 }, { donations: [row], total: 31, counts: { available: 12, requested: 4, scheduled: 3, completed: 8, cancelled: 4 } }, false, '', 0, null];
  let index = 0;
  const scope = { useState: () => { const i = index++; return [slots[i], (value) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; }, useEffect() {}, useAuth: () => ({ currentUser: { role: 'admin' } }), adminNavItems: [], donationTone: () => 'neutral', formatDate: (value) => value, formatTime: () => '12:00' };
  for (const name of ['AppShell', 'PageHeader', 'Table', 'Badge', 'Pagination', 'Modal', 'ArrowRight', 'Search', 'RotateCw']) scope[name] = name;
  const { AdminDonations } = await compile(scope);
  const all = nodes(AdminDonations());
  assert.deepEqual(all.filter((node) => node.type === 'dd').map((node) => node.props.children[0]), [12, 4, 3, 8, 4]);
  const table = all.find((node) => node.type === 'Table');
  assert.deepEqual(table.props.rows, [row]);
  assert.deepEqual(table.props.columns.map((column) => column.label), ['Product', 'Farmer', 'Qty', 'Organization', 'Pickup', 'Created', 'Status', 'Action']);
  assert.equal(table.props.columns[3].render(row).props.children[0], 'Not claimed');
  assert.equal(table.props.columns[4].render(row).props.children[0], 'Not scheduled');
  table.props.columns[7].render(row).props.onClick();
  assert.equal(slots[5], row);
  const search = all.find((node) => node.type === 'input' && node.props.type === 'search');
  search.props.onChange({ target: { value: 'Cebu' } });
  assert.equal(slots[0].search, 'Cebu');
  assert.equal(slots[0].page, 1);
  assert.equal(slots[2], true);
  assert.equal(all.find((node) => node.type === 'Pagination').props.pageSize, 20);
});

test('urgency warns only on real expiration or overdue active pickups', async () => {
  const { donationUrgency } = await compile({});
  assert.equal(donationUrgency({ status: 'available' }, '2026-10-10'), null);
  assert.equal(donationUrgency({ status: 'available', expirationDate: '2026-10-12' }, '2026-10-10').label, 'Expires soon');
  assert.equal(donationUrgency({ status: 'scheduled', pickupDate: '2026-10-09' }, '2026-10-10').label, 'Pickup overdue');
  assert.equal(donationUrgency({ status: 'available', expirationDate: '2026-10-09' }, '2026-10-10').label, 'Expired');
  for (const status of ['completed', 'cancelled']) assert.equal(donationUrgency({ status, expirationDate: '2026-10-09', pickupDate: '2026-10-09' }, '2026-10-10'), null);
});
