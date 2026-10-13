import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

let product;
let beforeWrite;
const farmer = { id: 'farmer', name: 'Farmer', role: 'farmer' };
const admin = { id: 'admin', role: 'admin' };
const value = (row, key) => key === 'price_review->>status' ? row.price_review?.status : row[key];
mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin: { from(table) {
  let update;
  const filters = [];
  const result = (single) => {
    if (update && beforeWrite) { const action = beforeWrite; beforeWrite = null; action(); }
    let rows = table === 'products' ? [product] : table === 'profiles' ? [farmer] : [];
    rows = rows.filter((row) => filters.every(([key, expected]) => value(row, key) === expected));
    if (update) {
      if (!rows.length) return { data: null, error: { code: 'PGRST116', message: 'Review changed' } };
      product = { ...product, ...update }; rows = [product];
    }
    return { data: single ? rows[0] || null : rows, error: null };
  };
  return { select() { return this; }, eq(key, expected) { filters.push([key, expected]); return this; }, in() { return this; },
    update(row) { update = row; return this; }, single() { return Promise.resolve(result(true)); },
    then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); } };
} } } });
mock.module('../src/lib/catalogRepo.js', { namedExports: { getCatalog: async () => ({ categories: [{ name: 'Vegetables' }], units: [{ value: 'kg' }, { value: 'box' }] }) } });
mock.module('../src/lib/historicalPriceService.js', { namedExports: { getHistoricalPriceAnalysis: async () => null } });
const { approvePriceReview, declinePriceReview, updateProduct, setProductStatus, getProduct, applyDiscount } = await import('../src/controllers/products.controller.js');
const { resubmitPriceReview } = await import('../src/lib/priceReview.js');

beforeEach(() => { beforeWrite = null; product = { id: 'eggplant', farmer_id: farmer.id, name: 'Eggplant', category: 'Vegetables', unit: 'kg', price: 180, quantity: 50, status: 'active', price_review: { status: 'pending', farmerPrice: 180, referencePrice: 100, referenceYear: 2025, reason: 'Above reference', createdAt: '2026-10-01' } }; });
async function invoke(handler, body = {}, profile = admin) {
  const res = { json(data) { this.body = data; } };
  await handler({ params: { id: product.id }, body, profile }, res);
  return res.body;
}

test('Adjustment records the Admin maximum and reason in the same unit without changing Farmer price', async () => {
  await invoke(declinePriceReview, { submittedPrice: 180, unit: 'kg', maxAllowedPrice: 120, reason: 'Please revise the price.' });
  assert.equal(product.price, 180);
  assert.equal(product.quantity, 50);
  assert.equal(product.status, 'inactive');
  assert.equal(product.price_review.status, 'needs_adjustment');
  assert.equal(product.price_review.maxAllowedPrice, 120);
  assert.equal(product.price_review.reviewUnit, 'kg');
  assert.equal(product.price_review.decidedBy, admin.id);
  assert.equal(product.price_review.declineReason, 'Please revise the price.');
  assert.ok(product.price_review.decidedAt);
});

test('Invalid amounts, missing reasons and wrong units cannot change a review', async () => {
  for (const patch of [{ maxAllowedPrice: 0 }, { maxAllowedPrice: -1 }, { maxAllowedPrice: 'bad' }, { reason: '' }, { unit: 'box' }]) {
    await assert.rejects(invoke(declinePriceReview, { submittedPrice: 180, unit: 'kg', maxAllowedPrice: 120, reason: 'Revise price', ...patch }), (error) => error.status === 400);
    assert.equal(product.price_review.status, 'pending');
  }
});

test('Farmer revision below the old threshold still waits for a new Admin approval', async () => {
  await invoke(declinePriceReview, { submittedPrice: 180, unit: 'kg', maxAllowedPrice: 110, reason: 'Use a lower price.' });
  await invoke(updateProduct, { price: 100, marketReference: { referencePrice: 100, referenceYear: 2025 } }, farmer);
  assert.equal(product.price, 100);
  assert.equal(product.status, 'inactive');
  assert.equal(product.price_review.status, 'pending');
  assert.equal(product.price_review.farmerPrice, 100);
  assert.equal(product.price_review.previousDecisions[0].maxAllowedPrice, 110);
  assert.equal(product.price_review.previousDecisions[0].farmerPrice, 180);
  await invoke(approvePriceReview, { submittedPrice: 100, unit: 'kg' });
  assert.equal(product.price_review.status, 'approved');
  assert.equal(product.price_review.approvedPrice, 100);
  assert.equal(product.price_review.maxAllowedPrice, null);
  assert.equal(product.price_review.declineReason, null);
  assert.equal(product.price_review.resumeListingStatus, null);
  assert.equal(product.price_review.previousDecisions[0].reason, 'Use a lower price.');
  assert.equal(product.status, 'active');
});

test('Non-price edits and manual deactivation cannot bypass review or restore a listing unintentionally', async () => {
  await invoke(declinePriceReview, { submittedPrice: 180, unit: 'kg', maxAllowedPrice: 110, reason: 'Revise price' });
  await invoke(updateProduct, { quantity: 60, marketReference: null }, farmer);
  assert.equal(product.price_review.status, 'needs_adjustment');
  await invoke(updateProduct, { price: 110, marketReference: null }, farmer);
  await invoke(setProductStatus, { status: 'inactive' }, farmer);
  await invoke(approvePriceReview, { submittedPrice: 110, unit: 'kg' });
  assert.equal(product.status, 'inactive');
  assert.equal(product.quantity, 60);
});

test('Stale decisions and approving a returned or already-decided product are rejected', async () => {
  await assert.rejects(invoke(approvePriceReview, { submittedPrice: 170, unit: 'kg' }), (error) => error.status === 409);
  await invoke(approvePriceReview, { submittedPrice: 180, unit: 'kg' });
  await assert.rejects(invoke(approvePriceReview), (error) => error.status === 409);
  await assert.rejects(invoke(declinePriceReview, { submittedPrice: 180, unit: 'kg', maxAllowedPrice: 100, reason: 'Revise' }), (error) => error.status === 409);
});

test('Returned products cannot be opened by customers or directly reactivated by the Farmer', async () => {
  await invoke(declinePriceReview, { submittedPrice: 180, unit: 'kg', maxAllowedPrice: 110, reason: 'Revise' });
  await assert.rejects(invoke(getProduct, {}, { role: 'buyer', id: 'buyer' }), (error) => error.status === 404);
  await assert.rejects(invoke(setProductStatus, { status: 'active' }, farmer), (error) => error.status === 400);
});

test('Price conversion and resubmission retain a required review when the unit or price changes', () => {
  const review = resubmitPriceReview({ referencePrice: 100, referenceYear: 2026, isOverride: true }, 500, product.price_review, 5, 'box');
  assert.equal(review.farmerPrice, 500);
  assert.equal(review.deviationPct, 0);
  assert.equal(review.reviewUnit, 'box');
  assert.equal(review.referenceSource, 'admin');
  assert.equal(review.status, 'pending');
});

test('Discount changes to a reviewed price must also be reviewed again', async () => {
  await invoke(approvePriceReview, { submittedPrice: 180, unit: 'kg' });
  await invoke(applyDiscount, { percent: 10 }, farmer);
  assert.equal(product.price, 162);
  assert.equal(product.price_review.status, 'pending');
  assert.equal(product.price_review.previousDecisions[0].approvedPrice, 180);
});

test('A concurrent deactivation or stock change cannot be overwritten by an old review', async () => {
  beforeWrite = () => { product.status = 'inactive'; };
  await assert.rejects(invoke(approvePriceReview, { submittedPrice: 180, unit: 'kg' }), (error) => error.status === 409);
  assert.equal(product.status, 'inactive');
  assert.equal(product.price_review.status, 'pending');
  beforeWrite = () => { product.quantity = 0; };
  await assert.rejects(invoke(declinePriceReview, { submittedPrice: 180, unit: 'kg', maxAllowedPrice: 100, reason: 'Revise price' }), (error) => error.status === 409);
  assert.equal(product.quantity, 0);
  assert.equal(product.price_review.status, 'pending');
});

test('Changing selling units does not relabel the old Admin maximum as a new-unit amount', async () => {
  await invoke(declinePriceReview, { submittedPrice: 180, unit: 'kg', maxAllowedPrice: 110, reason: 'Revise price' });
  await invoke(updateProduct, { price: 500, unit: 'box', kgPerUnit: 5, marketReference: { referencePrice: 100 } }, farmer);
  assert.equal(product.price_review.status, 'pending');
  assert.equal(product.price_review.reviewUnit, 'box');
  assert.equal(product.price_review.maxAllowedPrice, null);
  assert.equal(product.price_review.previousDecisions[0].maxAllowedPrice, 110);
  assert.equal(product.price_review.previousDecisions[0].reviewUnit, 'kg');
});
