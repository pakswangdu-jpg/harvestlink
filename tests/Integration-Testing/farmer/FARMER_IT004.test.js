import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock, patchMock } = vi.hoisted(() => ({ getMock: vi.fn(), patchMock: vi.fn() }));
const productId = 'integration-okra-004';
const farmerId = 'integration-farmer-004';
let currentRow;
let databaseUpdateCount;
let routeHandlers;

function initialRow() {
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
    update(row) { state.operation = 'update'; state.update = row; databaseUpdateCount += 1; return chain; },
    eq(column, value) { state.filters.push({ column, value }); return chain; },
    in() { return chain; },
    order() { return chain; },
    then(resolve, reject) {
      if (table === 'profiles') return Promise.resolve({ data: [{ id: farmerId, name: 'Integration Farmer', farm_name: 'Test Farm', verification_status: 'verified' }], error: null }).then(resolve, reject);
      if (table === 'ratings') return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      const requestedFarmer = state.filters.find(({ column }) => column === 'farmer_id')?.value;
      const rows = requestedFarmer && requestedFarmer !== currentRow.farmer_id ? [] : [currentRow];
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    },
    single() {
      if (table !== 'products') return Promise.resolve({ data: null, error: null });
      if (state.operation === 'update') {
        currentRow = { ...currentRow, ...state.update };
        return Promise.resolve({ data: currentRow, error: null });
      }
      const requestedId = state.filters.find(({ column }) => column === 'id')?.value;
      return Promise.resolve({ data: requestedId === currentRow.id ? currentRow : null, error: null });
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
vi.mock('../../../src/services/apiClient.js', () => ({
  apiClient: { get: getMock, patch: patchMock },
}));

const { listProducts, updateProduct } = await import('../../../backend/src/controllers/products.controller.js');
const { getProductsByFarmer, updateProduct: updateProductRequest } = await import('../../../src/services/productService.js');

function makeResponse() {
  let body;
  return { json: vi.fn((value) => { body = value; }), get body() { return body; } };
}

function installApplicationRoutes() {
  patchMock.mockImplementation(async (path, values) => {
    const match = path.match(/^\/products\/(.+)$/);
    const res = makeResponse();
    await updateProduct({ profile: { id: farmerId, role: 'farmer' }, params: { id: match[1] }, body: values }, res);
    return res.body;
  });
  getMock.mockImplementation(async (path) => {
    const farmer = new URL(`http://harvestlink.test${path}`).searchParams.get('farmerId');
    const res = makeResponse();
    await listProducts({ profile: { id: farmerId, role: 'farmer' }, query: { farmerId: farmer } }, res);
    return res.body;
  });
}

describe('IT-004 – Updated Product Retrieval', () => {
  beforeEach(() => {
    currentRow = initialRow();
    databaseUpdateCount = 0;
    getMock.mockReset();
    patchMock.mockReset();
    routeHandlers = installApplicationRoutes();
  });

  it('retrieves the edited product through the real service and backend listing flow', async () => {
    const updated = await updateProductRequest(productId, { price: 130, quantity: 8, description: 'Freshly harvested okra' });
    expect(patchMock).toHaveBeenCalledOnce();
    expect(updated).toMatchObject({ id: productId, price: 130, quantity: 8 });

    const products = await getProductsByFarmer(farmerId);
    expect(getMock).toHaveBeenCalledOnce();
    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      id: productId, farmerId, name: 'Okra', grade: 'A', price: 130, quantity: 8,
      unit: 'kg', location: 'Mandaue City', description: 'Freshly harvested okra', status: 'active',
      updatedAt: '2026-11-20T02:00:00.000Z',
      priceReview: { status: 'pending' },
    });
    expect(products.some((product) => product.price === 120 || product.quantity === 5)).toBe(false);
    expect(new Set(products.map((product) => product.id)).size).toBe(1);
    expect(databaseUpdateCount).toBe(1);
  });

  it('preserves the product identity and unchanged listing fields after refresh', async () => {
    await updateProductRequest(productId, { price: 130, quantity: 8, description: 'Freshly harvested okra' });
    const [product] = await getProductsByFarmer(farmerId);
    expect(product.farmerId).toBe(farmerId);
    expect(product.category).toBe('Vegetables');
    expect(product.unit).toBe('kg');
    expect(product.createdAt).toBe('2026-11-20T02:00:00.000Z');
  });

  it('does not return the edited record for a different farmer', async () => {
    const products = await (async () => {
      const res = makeResponse();
      await listProducts({ profile: { id: 'different-farmer', role: 'farmer' }, query: { farmerId: 'different-farmer' } }, res);
      return res.body;
    })();
    expect(products).toEqual([]);
    expect(patchMock).not.toHaveBeenCalled();
  });
});

