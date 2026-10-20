import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const source = await readFile(new URL('../src/features/admin/priceMonitoring/PendingPriceReviews.jsx', import.meta.url), 'utf8');
const { code } = await transformWithOxc(source.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace('export default ', ''), 'Pending.jsx', { jsx: { runtime: 'classic' } });
const product = { id: 'eggplant', name: 'Eggplant', farmerName: 'John Dela Cruz', price: 171, quantity: 50, unit: 'kg', priceReview: { status: 'pending', referencePrice: 100, createdAt: '2026-10-13' } };
const nodes = (node) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(nodes)];

function fixture() {
  const slots = [];
  let index = 0;
  const calls = [];
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useRef: (value) => { const slot = index++; return slots[slot] ??= { current: value }; },
    useState: (value) => { const slot = index++; if (!(slot in slots)) slots[slot] = value; return [slots[slot], (next) => { slots[slot] = next; }]; },
    useEffect: () => {},
    Table: 'table', Button: 'button', Modal: 'modal', LoadingState: 'loading', Eye: 'eye', Check: 'check',
    formatCurrency: (value) => 'PHP ' + Number(value).toFixed(2), formatDate: (value) => value,
    priceReviewComparison: () => ({ referencePrice: 100, deviationPct: 71, possibleOverpricing: true, referenceSource: 'PSA reference' }),
    approvePriceReview: async (...args) => calls.push(['approve', ...args]),
    declinePriceReview: async (...args) => calls.push(['adjust', ...args]),
    getCropForecastDetail: async () => ({}),
  };
  const Component = new Function('scope', 'with(scope){' + code + '; return PendingReviews;}')(scope);
  const props = { reviews: [product], commodities: [], onNotice() {}, onError() {}, onReload() {} };
  return { calls, render() { index = 0; return nodes(Component(props)); } };
}

test('Pending rows retain real submitted price, unit, stock, reference and date columns', () => {
  const app = fixture();
  const table = app.render().find((node) => node.type === 'table');
  assert.deepEqual(table.props.columns.map((column) => column.key), ['name', 'farmerName', 'price', 'unit', 'reference', 'difference', 'quantity', 'submitted', 'actions']);
  assert.equal(table.props.rows[0], product);
  assert.equal(table.props.columns[2].render(product), 'PHP 171.00');
  assert.equal(table.props.columns[6].render(product), '50 kg');
  assert.equal(table.props.columns[7].render(product), '2026-10-13');
});

test('Approve opens confirmation before sending a snapshot of the submitted price', async () => {
  const app = fixture();
  const table = app.render().find((node) => node.type === 'table');
  table.props.columns.at(-1).render(product).props.children[1].props.onClick();
  assert.deepEqual(app.calls, []);
  const all = app.render();
  assert.equal(all.find((node) => node.type === 'modal').props.title, 'Approve this selling price?');
  await all.find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(app.calls, [['approve', product.id, { submittedPrice: 171, unit: 'kg' }]]);
});

test('Adjustment requires an Admin maximum and note and preserves the Farmer submission', async () => {
  const app = fixture();
  app.render().find((node) => node.type === 'table').props.columns.at(-1).render(product).props.children[2].props.onClick();
  await app.render().find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(app.calls, []);
  const all = app.render();
  all.find((node) => node.type === 'input').props.onChange({ target: { value: '150' } });
  all.find((node) => node.type === 'textarea').props.onChange({ target: { value: 'Please revise your price.' } });
  await app.render().find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(app.calls, [['adjust', product.id, { submittedPrice: 171, unit: 'kg', maxAllowedPrice: 150, reason: 'Please revise your price.' }]]);
  assert.equal(product.price, 171);
});

test('Read-only details never submits an approval or adjustment', async () => {
  const app = fixture();
  app.render().find((node) => node.type === 'table').props.columns.at(-1).render(product).props.children[0].props.onClick();
  await app.render().find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(app.calls, []);
});

test('Review table reserves action width and keeps scrolling accessible', async () => {
  const css = await readFile(new URL('../src/features/admin/AdminPriceMonitoring.css', import.meta.url), 'utf8');
  assert.match(css, /min-width: 1440px/);
  assert.match(css, /:last-child \{ width: 400px/);
  assert.match(source, /scrollLabel="Pending price reviews"/);
});
