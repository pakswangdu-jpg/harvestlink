import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const source = await readFile(new URL('../src/features/admin/priceMonitoring/priceReviewPresentation.js', import.meta.url), 'utf8');
const comparison = new Function('matchCommodity', 'getFixedKgPerUnit', source.replace(/import .*?;\s*/g, '').replace('export function', 'function') + ';return priceReviewComparison;')(() => ({ id: 'eggplant' }), (unit) => unit === 'kg' ? 1 : null);

test('Price comparison uses the current reference and compares different selling units per kg', () => {
  const product = { name: 'Eggplant', price: 500, unit: 'box', kgPerUnit: 5, priceReview: { referencePrice: 50, referenceYear: 2025 } };
  const current = [{ id: 'eggplant', referencePrice: 100, referenceYear: 2026, psaPrice: 80, isOverride: true }];
  const result = comparison(product, current);
  assert.equal(result.pricePerKg, 100);
  assert.equal(result.referencePrice, 100);
  assert.equal(result.deviationPct, 0);
  assert.equal(result.referenceSource, 'Admin reference');
  assert.equal(result.psaPrice, 80);
  assert.equal(result.possibleOverpricing, false);
  assert.equal(product.price, 500);
});

test('Comparison flags the existing deviation rule or a saved Admin maximum in the same unit', () => {
  const product = { name: 'Eggplant', price: 150, unit: 'kg', priceReview: { referencePrice: 100 } };
  assert.equal(comparison(product).possibleOverpricing, true);
  const revised = { ...product, price: 110, priceReview: { ...product.priceReview, maxAllowedPrice: 105, reviewUnit: 'kg' } };
  assert.equal(comparison(revised).possibleOverpricing, true);
  assert.equal(comparison({ ...revised, priceReview: { ...revised.priceReview, reviewUnit: 'box' } }).maxAllowedPrice, null);
});

const noticeSource = await readFile(new URL('../src/components/products/ProductPriceReviewNotice.jsx', import.meta.url), 'utf8');
const { code } = await transformWithOxc(noticeSource.replace(/import .*?;\s*/g, '').replace('export default ', ''), 'Notice.jsx', { jsx: { runtime: 'classic' } });
const Notice = new Function('React', 'formatCurrency', 'formatDate', code + ';return ProductPriceReviewNotice;')({ createElement: (type, props, ...children) => ({ type, props, children }) }, (amount) => `PHP ${amount}`, (date) => date);
const text = (node) => !node ? '' : typeof node !== 'object' ? String(node) : node.children.flat(Infinity).map(text).join('');

test('Farmer sees their price, the same-unit Admin maximum and real note without invented audit data', () => {
  const product = { price: 180, unit: 'kg', priceReview: { status: 'needs_adjustment', maxAllowedPrice: 150, reviewUnit: 'kg', declineReason: 'Please revise your price.' } };
  const content = text(Notice({ product, showSubmitted: true }));
  assert.match(content, /Your price: PHP 180\/kg/);
  assert.match(content, /Admin maximum price: PHP 150\/kg/);
  assert.match(content, /Please revise your price/);
  assert.doesNotMatch(content, /Approved by Admin/);
  assert.equal(product.price, 180);
});

test('Approved details show only persisted approval amounts and dates', () => {
  assert.equal(Notice({ product: { priceReview: { status: 'pending' } } }), null);
  const content = text(Notice({ product: { unit: 'kg', priceReview: { status: 'approved', approvedPrice: 171, reviewUnit: 'kg', decidedAt: '2026-10-13', decidedBy: 'admin' } } }));
  assert.match(content, /Price approved: PHP 171\/kg/);
  assert.match(content, /Approved by Admin.*2026-10-13/);
  const legacy = text(Notice({ product: { unit: 'kg', priceReview: { status: 'approved' } } }));
  assert.doesNotMatch(legacy, /Approved by Admin|2026/);
});
