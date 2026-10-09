import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';
import { getApplicableUnitPrice, isWholesaleQuantity } from '../backend/shared/pricing.js';

async function harness(onSubmit) {
  const original = await readFile(new URL('../src/components/forms/CheckoutForm.jsx', import.meta.url), 'utf8');
  const source = original.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replace(/import\s+['"][^'"]+['"];?/g, '').replace('export default ', '');
  const { code } = await transformWithOxc(source, 'CheckoutForm.jsx', { jsx: { runtime: 'classic' } });
  const values = []; const refs = []; let index = 0; let refIndex = 0;
  const scope = { React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) }, useState(initial) { const slot = index++; if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial; return [values[slot], (next) => { values[slot] = typeof next === 'function' ? next(values[slot]) : next; }]; }, useRef(initial) { const slot = refIndex++; return refs[slot] ||= { current: initial }; }, useEffect() {}, CEBU_MUNICIPALITIES: ['Cebu City'], PAYMENT_METHODS: [{ value: 'cod', label: 'Cash on Delivery' }], DELIVERY_METHODS: [{ value: 'farmer_delivery', label: 'Farmer delivery' }], matchMunicipality: () => 'Cebu City', getApplicableUnitPrice, isWholesaleQuantity, formatQuantity: String, validateCheckoutForm: () => ({}), hasErrors: (errors) => Object.keys(errors).length > 0, crypto: { randomUUID: () => '10000000-0000-4000-8000-000000000001' } };
  for (const name of ['FormField', 'CheckoutProductCard', 'QuantityStepper', 'OrderSummaryPanel', 'CheckoutTrustRow', 'Truck', 'Banknote', 'MapPin', 'Check', 'gcashLogo', 'lalamoveLogo', 'buyerPickupIcon']) scope[name] = name;
  const Form = new Function('scope', `with(scope){${code};return CheckoutForm;}`)(scope);
  const props = { product: { id: 'p1', price: 55, quantity: 10, unit: 'kg' }, currentUser: { municipality: 'Cebu City' }, onSubmit };
  const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];
  const render = () => { index = 0; refIndex = 0; const tree = Form(props); return { tree, summary: nodes(tree).find((node) => node.type === 'OrderSummaryPanel').props }; };
  render();
  const quote = { unitPrice: 55, subtotal: 55, total: 95, retailSubtotal: 55, discount: 0, estimate: { fee: 40 } };
  values[4] = { key: JSON.stringify(['p1', '1', 'farmer_delivery', 'Cebu City']), data: quote };
  return { render, values };
}

test('checkout requires review and prevents double-click and post-success duplicates', async () => {
  const calls = []; let resolve;
  const page = await harness((values) => { calls.push(values); return new Promise((done) => { resolve = done; }); });
  await page.render().tree.props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 0);
  page.render().summary.onReview(true);
  const { tree } = page.render();
  const pending = tree.props.onSubmit({ preventDefault() {} });
  await tree.props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedTotal, 95);
  assert.equal(calls[0].checkoutKey, '10000000-0000-4000-8000-000000000001');
  assert.equal(page.render().summary.isSubmitting, true);
  resolve(); await pending;
  await page.render().tree.props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 1);
  assert.equal(page.render().summary.orderPlaced, true);
});

test('uncertain checkout retries retain the same key and changed details invalidate review', async () => {
  const calls = [];
  const page = await harness(async (values) => { calls.push(values); throw new Error('Connection lost'); });
  page.render().summary.onReview(true);
  await page.render().tree.props.onSubmit({ preventDefault() {} });
  await page.render().tree.props.onSubmit({ preventDefault() {} });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].checkoutKey, calls[1].checkoutKey);
  page.values[0] = { ...page.values[0], quantity: '2' };
  assert.equal(page.render().summary.isReviewed, false);
  assert.equal(page.render().summary.quote, null);
});
