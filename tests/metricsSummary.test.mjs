import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const source = (await readFile(new URL('../src/components/dashboard/MetricsSummary.jsx', import.meta.url), 'utf8'))
  .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
  .replace(/import\s+['"][^'"]+['"];?/g, '').replace('export default ', '');
const { code } = await transformWithOxc(source, 'MetricsSummary.jsx', { jsx: { runtime: 'classic' } });
const scope = {
  React: { createElement(type, props, ...children) {
    const values = { ...props, children };
    return typeof type === 'function' ? type(values) : { type, props: values };
  } },
  ArrowRight: 'arrow', ClipboardList: 'orders', Package: 'products', TrendingUp: 'trend', Wallet: 'wallet', Link: 'link',
};
const Summary = new Function('scope', `with(scope){${code};return MetricsSummary;}`)(scope);
const data = {
  financialMetrics: [{ label: 'Total income', value: 'PHP 2,100.44', hint: 'from 28 paid orders' }, { label: 'Profit', value: 'PHP 160.44', hint: 'after recorded costs', trend: true }],
  productMetrics: [{ label: 'Total products', value: 5 }, { label: 'Active listings', value: 2, hint: 'active listings' }],
  orderMetrics: [{ label: 'Pending orders', value: 11, hint: 'pending orders' }, { label: 'Confirmed orders', value: 15 }],
};
const nodes = (node) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(nodes)];
const text = (node) => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.props?.children || []).flat(Infinity).map(text).join('');

test('responsive business summary preserves all supplied values and supporting text', () => {
  const before = structuredClone(data);
  const tree = Summary(data);
  const all = nodes(tree);
  assert.deepEqual(all.filter((node) => node.props.className === 'product-stats-value').map(text), ['PHP 2,100.44', 'PHP 160.44', '2', '11']);
  for (const label of ['from 28 paid orders', 'after recorded costs', 'active listings', 'pending orders', '5 Total products', '15 Confirmed orders']) assert.ok(text(tree).includes(label));
  assert.equal(all.find((node) => node.type === 'link').props.to, '/farmer-orders');
  assert.deepEqual(data, before);
});

test('trend icon is separate from the currency text and cannot force an amount to split', () => {
  const tree = Summary(data);
  const row = nodes(tree).find((node) => node.props.className === 'business-summary-number-row' && nodes(node).some((child) => child.type === 'trend'));
  assert.equal(row.props.children[0].type, 'p');
  assert.equal(text(row.props.children[0]), 'PHP 160.44');
  assert.equal(row.props.children[1].type, 'trend');
});
