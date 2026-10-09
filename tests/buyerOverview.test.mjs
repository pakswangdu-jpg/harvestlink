import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const formatters = await readFile(new URL('../src/utils/formatters.js', import.meta.url), 'utf8');
const currencyFunction = formatters.slice(formatters.indexOf('export function formatCurrency'), formatters.indexOf('export function titleCase')).replace('export ', '');
const formatCurrency = new Function(`${currencyFunction};return formatCurrency;`)();

const source = await readFile(new URL('../src/features/buyer/BuyerDashboard.jsx', import.meta.url), 'utf8');
const start = source.indexOf('<div className="buyer-order-summary');
const markup = source.slice(start, source.indexOf('</section>', start)).trim();
const { code } = await transformWithOxc(`function Overview() { return (${markup}); }`, 'Overview.jsx', { jsx: { runtime: 'classic' } });
const nodes = (node) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(nodes)];
const text = (node) => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.props?.children || []).flat(Infinity).map(text).join('');
function render(isLoading = false) {
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    Link: 'link', ClipboardList: 'clipboard', Clock3: 'clock', CheckCircle2: 'check', Wallet: 'wallet', ArrowRight: 'arrow',
    orders: Array(108), pendingOrders: Array(41), completedOrders: Array(27), totalSpend: 2584.94, formatCurrency, isLoading,
  };
  return new Function('scope', `with(scope){${code};return Overview();}`)(scope);
}

test('buyer overview retains live values and existing currency formatting', () => {
  const tree = render();
  assert.deepEqual(nodes(tree).filter((node) => node.type === 'strong').map(text), ['108', '41', '27', formatCurrency(2584.94)]);
  assert.deepEqual(nodes(tree).filter((node) => node.type === 'small').map(text), ['View all orders ', 'Needs attention ', 'Orders received', 'Paid orders']);
});

test('every card retains its existing destination and filter state', () => {
  const links = nodes(render()).filter((node) => node.type === 'link');
  assert.equal(links.length, 4);
  assert.ok(links.every((node) => node.props.to === '/buyer-orders'));
  assert.deepEqual(links.map((node) => node.props.state), [undefined, { stage: 'pending' }, { stage: 'completed' }, { paymentFilter: 'paid' }]);
});

test('loading still displays placeholders instead of example values', () => {
  assert.deepEqual(nodes(render(true)).filter((node) => node.type === 'strong').map(text), ['...', '...', '...', '...']);
});
