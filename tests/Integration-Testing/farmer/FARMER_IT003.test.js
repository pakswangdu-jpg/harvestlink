import { beforeEach, describe, expect, it, vi } from 'vitest';

const { patchMock } = vi.hoisted(() => ({ patchMock: vi.fn() }));
const productId = 'integration-okra-003';
const farmerId = 'integration-farmer-003';
let existingRow;
let updatedRow;
let updateCalls;

function makeExistingRow() {
  return {
    id: productId, farmer_id: farmerId, name: 'Okra', category: 'Vegetables', grade: 'A', selling_type: 'retail',
    price: 120, quantity: 5, unit: 'kg', location: 'Mandaue City', description: 'Fresh okra', status: 'active',
    price_review: { status: 'approved', approvedPrice: 120, reviewUnit: 'kg', referencePrice: 120 },
    cost_price: 80, wholesale_price: null, wholesale_min_quantity: null, moq: null, kg_per_unit: null,
    image_url: null, image_urls: [], original_price: null, discount_percent: null, expiration_date: null,
    created_at: '2026-11-20T02:00:00.000Z', updated_at: '2026-11-20T02:00:00.000Z',
  };
}

function query(table) {
  const state = { operation: 'select', filters: [], update: null };
  const chain = {
    select() { return chain; },
    update(row) { state.operation = 'update'; state.update = row; updateCalls.push({ table, row, filters: state.filters }); return chain; },
    eq(column, value) { state.filters.push({ column, value }); return chain; },
    in() { return chain; },
    order() { return chain; },
    single() {
      if (table === 'products' && state.operation === 'update') {
        updatedRow = { ...existingRow, ...state.update, updated_at: state.update.updated_at || existingRow.updated_at };
        return Promise.resolve({ data: updatedRow, error: null });
      }
      return Promise.resolve({ data: table === 'products' ? existingRow : null, error: null });
    },
    then(resolve, reject) {
      if (table === 'profiles') return Promise.resolve({ data: [{ id: farmerId, name: 'Integration Farmer', farm_name: 'Test Farm', verification_status: 'verified' }], error: null }).then(resolve, reject);
      if (table === 'ratings') return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      return Promise.resolve({ data: [existingRow], error: null }).then(resolve, reject);
    },
  };
  return chain;
}

vi.mock('../../../backend/src/lib/supabaseClient.js', () => ({
  supabaseAdmin: { from: (table) => query(table), rpc: vi.fn() },
}));
vi.mock('../../../backend/src/lib/catalogRepo.js', () => ({
  getCatalog: vi.fn(async () => ({ categories: [{ name: 'Vegetables' }], units: [{ value: 'kg' }] })),
}));
vi.mock('../../../backend/src/lib/effectiveMarketPrice.js', () => ({ getServerPriceReviewReference: vi.fn(async () => null) }));
vi.mock('../../../backend/src/lib/priceReviewNotifications.js', () => ({ notifyAdminsOfPriceReview: vi.fn(), notifyFarmerOfPriceDecision: vi.fn() }));
vi.mock('../../../backend/src/middleware/requireAuth.js', () => ({ invalidateAuthCacheForUser: vi.fn() }));
vi.mock('../../../src/services/apiClient.js', () => ({ apiClient: { patch: patchMock } }));

const { updateProduct } = await import('../../../backend/src/controllers/products.controller.js');
const { updateProduct: updateProductRequest } = await import('../../../src/services/productService.js');

function response() {
  let body;
  return { json: vi.fn((value) => { body = value; }), get body() { return body; } };
}

describe('IT-003 – Farmer Edit Product', () => {
  beforeEach(() => {
    existingRow = makeExistingRow();
    updatedRow = null;
    updateCalls = [];
    patchMock.mockReset();
  });

  it('sends one update request through the API client and persists the edited product through the backend handler', async () => {
    const changes = { price: 130, quantity: 8, description: 'Freshly harvested okra' };
    patchMock.mockResolvedValue({ id: productId, ...changes });

    const apiResult = await updateProductRequest(productId, changes);
    expect(patchMock).toHaveBeenCalledOnce();
    expect(patchMock).toHaveBeenCalledWith(`/products/${productId}`, changes);
    expect(apiResult).toMatchObject({ id: productId, price: 130, quantity: 8 });

    const req = { profile: { id: farmerId, role: 'farmer' }, params: { id: productId }, body: changes };
    const res = response();
    await updateProduct(req, res);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ table: 'products', filters: [{ column: 'id', value: productId }] });
    expect(updateCalls[0].row).toMatchObject({ price: 130, quantity: 8, description: 'Freshly harvested okra', name: 'Okra', category: 'Vegetables', grade: 'A', unit: 'kg', location: 'Mandaue City' });
    expect(res.body).toMatchObject({ id: productId, farmerId, name: 'Okra', price: 130, quantity: 8, description: 'Freshly harvested okra', location: 'Mandaue City' });
    expect(res.body.priceReview.status).toBe('pending');
    expect(res.body.grade).toBe('A');
    expect(existingRow.price).toBe(120);
    expect(existingRow.quantity).toBe(5);
    expect(updateCalls[0].row.farmer_id).toBeUndefined();
  });

  it('preserves ownership and unchanged fields while returning the refreshed listing record', async () => {
    const res = response();
    await updateProduct({ profile: { id: farmerId, role: 'farmer' }, params: { id: productId }, body: { price: 130, quantity: 8, description: 'Freshly harvested okra' } }, res);
    expect(res.body.farmerId).toBe(farmerId);
    expect(res.body.category).toBe(existingRow.category);
    expect(res.body.unit).toBe(existingRow.unit);
    expect(res.body.location).toBe(existingRow.location);
    expect(res.body.createdAt).toBe(existingRow.created_at);
    expect(res.body.id).toBe(productId);
  });

  it('rejects an update when the selected product belongs to another farmer', async () => {
    await expect(updateProduct(
      { profile: { id: 'different-farmer', role: 'farmer' }, params: { id: productId }, body: { price: 130 } },
      response(),
    )).rejects.toMatchObject({ status: 403 });
    expect(updateCalls).toHaveLength(0);
  });
});

