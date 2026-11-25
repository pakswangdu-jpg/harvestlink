import { beforeEach, describe, expect, it, vi } from 'vitest';

const farmerId = 'integration-farmer-002';
const otherFarmerId = 'integration-farmer-other';
let databaseMode = 'normal';
let queryCalls = [];

const farmerProducts = [
  {
    id: 'integration-okra-approved', farmer_id: farmerId, name: 'Okra', category: 'Vegetables', grade: 'A',
    selling_type: 'retail', price: 120, quantity: 5, unit: 'kg', location: 'Mandaue City',
    description: 'Fresh okra', status: 'active', price_review: { status: 'approved', approved_price: 120 },
    image_url: null, image_urls: [], created_at: '2026-11-20T02:00:00.000Z', updated_at: '2026-11-24T02:00:00.000Z',
  },
  {
    id: 'integration-okra-pending', farmer_id: farmerId, name: 'Okra', category: 'Vegetables', grade: 'A',
    selling_type: 'retail', price: 130, quantity: 8, unit: 'kg', location: 'Mandaue City',
    description: 'Pending price review', status: 'active', price_review: { status: 'pending' },
    image_url: null, image_urls: [], created_at: '2026-11-21T02:00:00.000Z', updated_at: '2026-11-23T02:00:00.000Z',
  },
  {
    id: 'integration-other-farmer-product', farmer_id: otherFarmerId, name: 'Carrot', category: 'Vegetables', grade: 'A',
    selling_type: 'retail', price: 80, quantity: 4, unit: 'kg', location: 'Cebu City',
    description: 'Another farmer product', status: 'active', price_review: { status: 'approved' },
    image_url: null, image_urls: [], created_at: '2026-11-22T02:00:00.000Z', updated_at: '2026-11-22T02:00:00.000Z',
  },
];

function query(table) {
  const state = { filters: [], error: null };
  const chain = {
    select() { return chain; },
    order() { return chain; },
    eq(column, value) { state.filters.push({ column, value }); return chain; },
    gt() { return chain; },
    or() { return chain; },
    in(column, values) {
      state.filters.push({ column, values });
      return chain;
    },
    then(resolve, reject) {
      queryCalls.push({ table, filters: state.filters });
      if (databaseMode === 'error' && table === 'products') {
        return Promise.resolve({ data: null, error: { message: 'retrieval failed' } }).then(resolve, reject);
      }
      if (table === 'products') {
        let rows = databaseMode === 'empty' ? [] : [...farmerProducts];
        state.filters.filter(({ column, value }) => column === 'farmer_id')
          .forEach(({ value }) => { rows = rows.filter((row) => row.farmer_id === value); });
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      }
      if (table === 'profiles') {
        const ids = state.filters.find(({ column }) => column === 'id')?.values || [];
        const rows = ids.map((id) => ({ id, name: id === farmerId ? 'Integration Farmer' : 'Other Farmer', farm_name: 'Test Farm', verification_status: 'verified' }));
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      }
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    },
  };
  return chain;
}

vi.mock('../../../backend/src/lib/supabaseClient.js', () => ({
  supabaseAdmin: { from: (table) => query(table), rpc: vi.fn() },
}));

const { listProducts } = await import('../../../backend/src/controllers/products.controller.js');

function request() {
  return { profile: { id: farmerId, role: 'farmer' }, query: {} };
}

function response() {
  let body;
  return { json: vi.fn((value) => { body = value; }), get body() { return body; } };
}

describe('IT-002 – Farmer Product Retrieval', () => {
  beforeEach(() => { databaseMode = 'normal'; queryCalls = []; });

  it('retrieves only the farmer products and exposes the listing fields used by the product table', async () => {
    const res = response();
    await listProducts(request(), res);

    expect(res.json).toHaveBeenCalledOnce();
    expect(res.body).toHaveLength(2);
    expect(res.body.every((product) => product.farmerId === farmerId)).toBe(true);
    expect(res.body.map((product) => product.id)).toEqual([
      'integration-okra-approved', 'integration-okra-pending',
    ]);

    expect(res.body[0]).toMatchObject({
      name: 'Okra', grade: 'A', price: 120, unit: 'kg', quantity: 5,
      location: 'Mandaue City', status: 'active', updatedAt: '2026-11-24T02:00:00.000Z',
      priceReview: { status: 'approved', approved_price: 120 },
      farmerName: 'Integration Farmer',
    });
    expect(res.body[1]).toMatchObject({ name: 'Okra', price: 130, quantity: 8, priceReview: { status: 'pending' } });
    expect(new Set(res.body.map((product) => product.id)).size).toBe(res.body.length);
    expect(queryCalls.find(({ table }) => table === 'products').filters).toContainEqual({ column: 'farmer_id', value: farmerId });
  });

  it('returns an empty product list when the farmer has no listings', async () => {
    databaseMode = 'empty';
    const res = response();
    await listProducts(request(), res);
    expect(res.body).toEqual([]);
  });

  it('propagates a retrieval error from the database boundary', async () => {
    databaseMode = 'error';
    await expect(listProducts(request(), response())).rejects.toMatchObject({ message: 'retrieval failed', status: 400 });
  });
});

