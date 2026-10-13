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
        return {
          select() { return this; },
          eq() { return this; },
          gt() { return this; },
          or(expression) {
            queryFilters.push(expression);
            return this;
          },
          order() { return this; },
          in() { return this; },
          then(resolve, reject) {
            const data = table === 'products'
              ? [pendingProduct]
              : table === 'profiles'
                ? [{ id: 'farmer-1', name: 'Farmer', verification_status: 'verified' }]
                : [];
            return Promise.resolve({ data, error: null }).then(resolve, reject);
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

const { listProducts, listPublicProducts } = await import('../src/controllers/products.controller.js');

function response() {
  return {
    body: null,
    json(value) { this.body = value; },
  };
}

function assertPendingListingsAllowed() {
  const priceReviewFilter = queryFilters.find((filter) => filter.startsWith('price_review.'));
  assert.ok(priceReviewFilter);
  assert.match(priceReviewFilter, /price_review->>status\.eq\.pending/);
  assert.match(priceReviewFilter, /price_review->>status\.eq\.approved/);
  assert.match(priceReviewFilter, /price_review\.is\.null/);
  assert.doesNotMatch(priceReviewFilter, /price_review->>status\.eq\.declined/);
}

test('buyer and stakeholder marketplace feeds include pending, non-orderable listings', async () => {
  for (const role of ['buyer', 'stakeholder']) {
    queryFilters.length = 0;
    const res = response();

    await listProducts({ query: { activeOnly: 'true' }, profile: { role } }, res);

    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].priceReview.status, 'pending');
    assertPendingListingsAllowed();
  }
});

test('public farmer product feed includes pending review status for marketplace notice', async () => {
  queryFilters.length = 0;
  const res = response();

  await listPublicProducts({ query: { farmerId: 'farmer-1' } }, res);

  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].priceReview.status, 'pending');
  assertPendingListingsAllowed();
});
