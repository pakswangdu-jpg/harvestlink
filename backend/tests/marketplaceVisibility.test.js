import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const pendingProduct = {
  id: 'product-1',
  farmer_id: 'farmer-1',
  name: 'Eggplant',
  category: 'Vegetables',
  grade: 'A',
  selling_type: 'retail',
  price: 171,
  unit: 'kg',
  quantity: 20,
  location: 'Cebu City',
  status: 'active',
  price_review: { status: 'pending', deviationPct: 281.4 },
};
const queryFilters = [];

mock.module('../src/lib/supabaseClient.js', {
  namedExports: {
    supabaseAdmin: {
      from(table) {
        const filters = [];
        const result = () => {
          const data = table === 'products' ? [pendingProduct].filter((row) => filters.every((filter) => filter(row)))
            : table === 'profiles' ? [{ id: 'farmer-1', name: 'Farmer', verification_status: 'verified' }] : [];
          return { data, error: null };
        };
        return {
          select() { return this; },
          eq(field, value) { filters.push((row) => (field === 'price_review->>status' ? row.price_review?.status : row[field]) === value); return this; },
          gt(field, value) { filters.push((row) => row[field] > value); return this; },
          or(expression) {
            queryFilters.push(expression);
            filters.push((row) => expression.split(',').some((clause) => {
              const [, field, operator, expected] = clause.match(/^(.+?)\.(eq|neq|is|gte)\.(.*)$/);
              const value = field === 'price_review->>status' ? row.price_review?.status : row[field];
              if (operator === 'is') return value == null && expected === 'null';
              if (value == null) return false;
              if (operator === 'neq') return String(value) !== expected;
              if (operator === 'gte') return String(value) >= expected;
              return String(value) === expected;
            }));
            return this;
          },
          order() { return this; },
          in() { return this; },
          single() { return Promise.resolve({ data: result().data[0] || null, error: null }); },
          then(resolve, reject) {
            return Promise.resolve(result()).then(resolve, reject);
          },
        };
      },
    },
  },
});
mock.module('../src/lib/catalogRepo.js', {
  namedExports: { getCatalog: async () => ({ categories: [], units: [] }) },
});
mock.module('../src/lib/historicalPriceService.js', {
  namedExports: { getHistoricalPriceAnalysis: async () => null },
});

const { listProducts, listPublicProducts, getProduct, getPendingPriceReviews } = await import('../src/controllers/products.controller.js');

function response() {
  return {
    body: null,
    json(value) { this.body = value; },
  };
}

test('buyer and stakeholder marketplace feeds hide pending approval listings', async () => {
  for (const role of ['buyer', 'stakeholder']) {
    queryFilters.length = 0;
    const res = response();

    await listProducts({ query: { activeOnly: 'true' }, profile: { role } }, res);

    assert.equal(res.body.length, 0);
    assert.ok(queryFilters.some((filter) => filter.includes('price_review->>status.neq.pending')));
  }
});

test('public farmer product feed excludes pending approval listings', async () => {
  queryFilters.length = 0;
  const res = response();

  await listPublicProducts({ query: { farmerId: 'farmer-1' } }, res);

  assert.equal(res.body.length, 0);
  assert.ok(queryFilters.some((filter) => filter === 'price_review.is.null,price_review->>status.eq.approved'));
});

test('Returned prices cannot appear in customer feeds or public farmer listings', async () => {
  const previous = pendingProduct.price_review;
  pendingProduct.price_review = { status: 'needs_adjustment', maxAllowedPrice: 100, reviewUnit: 'kg' };
  try {
    for (const role of ['buyer', 'stakeholder']) {
      const res = response();
      await listProducts({ query: {}, profile: { role } }, res);
      assert.equal(res.body.length, 0);
      await listProducts({ query: { activeOnly: 'true' }, profile: { role } }, res);
      assert.equal(res.body.length, 0);
    }
    const res = response();
    await listPublicProducts({ query: { farmerId: 'farmer-1' } }, res);
    assert.equal(res.body.length, 0);
  } finally { pendingProduct.price_review = previous; }
});

test('Pending reviews remain visible to the owning farmer and Admin, but not another farmer', async () => {
  for (const profile of [{ role: 'farmer', id: 'farmer-1' }, { role: 'admin', id: 'admin' }]) {
    const res = response();
    await listProducts({ query: { farmerId: 'farmer-1' }, profile }, res);
    assert.equal(res.body[0].priceReview.status, 'pending');
  }
  const ownerRequest = response();
  await listProducts({ query: { farmerId: 'another-farmer' }, profile: { role: 'farmer', id: 'farmer-1' } }, ownerRequest);
  assert.equal(ownerRequest.body[0].priceReview.status, 'pending');
  for (const profile of [{ role: 'farmer', id: 'farmer-2' }, { role: 'buyer', id: 'buyer' }]) {
    const res = response();
    await listProducts({ query: {}, profile }, res);
    assert.equal(res.body.length, 0);
  }
  const queue = response();
  await getPendingPriceReviews({}, queue);
  assert.equal(queue.body[0].id, 'product-1');
});

test('Direct pending product access is restricted to the owner and Admin', async () => {
  for (const profile of [{ role: 'buyer' }, { role: 'stakeholder' }, { role: 'farmer', id: 'farmer-2' }]) {
    await assert.rejects(getProduct({ params: { id: 'product-1' }, profile }, response()), (error) => error.status === 404);
  }
  for (const profile of [{ role: 'admin' }, { role: 'farmer', id: 'farmer-1' }]) {
    const res = response();
    await getProduct({ params: { id: 'product-1' }, profile }, res);
    assert.equal(res.body.priceReview.status, 'pending');
  }
});

test('Approved and legacy products retain marketplace eligibility; declined and expired products do not', async () => {
  const original = { ...pendingProduct };
  try {
    for (const review of [null, { status: 'approved' }, { status: 'declined' }]) {
      pendingProduct.price_review = review;
      const res = response();
      await listProducts({ query: { activeOnly: 'true' }, profile: { role: 'buyer' } }, res);
      assert.equal(res.body.length, review?.status === 'declined' ? 0 : 1);
    }
    pendingProduct.price_review = { status: 'approved' };
    pendingProduct.expiration_date = '2020-01-01';
    const res = response();
    await listProducts({ query: { activeOnly: 'true' }, profile: { role: 'buyer' } }, res);
    assert.equal(res.body.length, 0);
    pendingProduct.expiration_date = null;
    pendingProduct.status = 'inactive';
    await listProducts({ query: { activeOnly: 'true' }, profile: { role: 'buyer' } }, res);
    assert.equal(res.body.length, 0);
    pendingProduct.status = 'active';
    pendingProduct.quantity = 0;
    await listProducts({ query: { activeOnly: 'true' }, profile: { role: 'buyer' } }, res);
    assert.equal(res.body.length, 0);
  } finally {
    delete pendingProduct.expiration_date;
    Object.assign(pendingProduct, original);
  }
});
