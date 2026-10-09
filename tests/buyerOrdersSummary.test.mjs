import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const source = await readFile(new URL('../src/features/buyer/BuyerOrders.jsx', import.meta.url), 'utf8');
const filters = source.slice(source.indexOf('const ORDER_OVERVIEW_FILTERS'), source.indexOf('];', source.indexOf('const ORDER_OVERVIEW_FILTERS')) + 2);
const start = source.indexOf('<div className="buyer-orders-summary"');
const markup = source.slice(start, source.indexOf('</section>', start)).trim();
const { code } = await transformWithOxc(`${filters}\nfunction Summary(){return (${markup});}`, 'Summary.jsx', { jsx: { runtime: 'classic' } });
const nodes = (node) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(nodes)];
const text = (node) => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.props?.children || []).flat(Infinity).map(text).join('');
function render(overviewFilter = 'all', onSelect = () => {}) {
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    ShoppingBag: 'bag', Clock3: 'clock', Truck: 'truck', CircleCheck: 'check', CircleX: 'cancel', ArrowRight: 'arrow',
    summary: { total: 108, pending: 41, toReceive: 18, completed: 27, cancelled: 22 },
    overviewFilter, selectOverviewFilter: onSelect,
  };
  return new Function('scope', `with(scope){${code};return Summary();}`)(scope);
}

test('order summary preserves all five supplied counts, labels and hints', () => {
  const all = nodes(render());
  assert.deepEqual(all.filter((node) => node.props.className === 'buyer-orders-summary-value').map(text), ['108', '41', '18', '27', '22']);
  assert.deepEqual(all.filter((node) => node.props.className === 'buyer-orders-summary-label').map(text), ['My Orders', 'Pending', 'To Receive', 'Completed', 'Cancelled']);
  assert.deepEqual(all.filter((node) => node.props.className === 'buyer-orders-summary-hint').map(text), ['View all orders', 'Needs confirmation', 'Orders on the way', 'Orders received', 'Cancelled orders']);
});

test('summary buttons retain filter keys, pressed state and selection handlers', () => {
  const selected = [];
  const buttons = nodes(render('to_receive', (key) => selected.push(key))).filter((node) => node.type === 'button');
  assert.deepEqual(buttons.map((node) => node.props['aria-pressed']), [false, false, true, false, false]);
  assert.ok(buttons.every((node) => node.props.type === 'button'));
  buttons.forEach((node) => node.props.onClick());
  assert.deepEqual(selected, ['all', 'pending', 'to_receive', 'completed', 'cancelled']);
});
