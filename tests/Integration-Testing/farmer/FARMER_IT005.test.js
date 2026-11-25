import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
const farmerId = 'integration-farmer-005';
let rows;

const databaseRows = [
  {
    id: 'product-okra-005', farmer_id: farmerId, name: 'Okra', category: 'Vegetables', grade: 'A', selling_type: 'retail',
    price: 120, quantity: 5, unit: 'kg', location: 'Mandaue City', status: 'active', price_review: { status: 'approved' },
    image_url: null, image_urls: [], description: 'Fresh okra', created_at: '2026-11-22T02:00:00.000Z', updated_at: '2026-11-24T02:00:00.000Z',
  },
  {
    id: 'product-eggplant-005', farmer_id: farmerId, name: 'Eggplant', category: 'Vegetables', grade: 'A', selling_type: 'retail',
    price: 80, quantity: 7, unit: 'kg', location: 'Mandaue City', status: 'active', price_review: { status: 'approved' },
    image_url: null, image_urls: [], description: 'Fresh eggplant', created_at: '2026-11-21T02:00:00.000Z', updated_at: '2026-11-23T02:00:00.000Z',
  },
  {
    id: 'product-tomato-005', farmer_id: farmerId, name: 'Tomato', category: 'Fruits', grade: 'B', selling_type: 'retail',
    price: 60, quantity: 4, unit: 'kg', location: 'Cebu City', status: 'active', price_review: { status: 'pending' },
    image_url: null, image_urls: [], description: 'Fresh tomato', created_at: '2026-11-20T02:00:00.000Z', updated_at: '2026-11-22T02:00:00.000Z',
  },
];

function query(table) {
  const state = { filters: [] };
  const chain = {
    select() { return chain; },
    order() { return chain; },
    eq(column, value) { state.filters.push({ column, value }); return chain; },
    in() { return chain; },
    or() { return chain; },
    then(resolve, reject) {
      if (table === 'profiles') return Promise.resolve({ data: [{ id: farmerId, name: 'Integration Farmer', farm_name: 'Test Farm', verification_status: 'verified' }], error: null }).then(resolve, reject);
      if (table === 'ratings') return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      const owner = state.filters.find(({ column }) => column === 'farmer_id')?.value;
      const data = rows.filter((row) => !owner || row.farmer_id === owner);
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  };
  return chain;
}

vi.mock('../../../backend/src/lib/supabaseClient.js', () => ({
  supabaseAdmin: { from: (table) => query(table), rpc: vi.fn() },
}));
vi.mock('../../../src/services/apiClient.js', () => ({ apiClient: { get: getMock } }));

const { listProducts } = await import('../../../backend/src/controllers/products.controller.js');
const { getProductsByFarmer } = await import('../../../src/services/productService.js');

function response() {
  let body;
  return { json: vi.fn((value) => { body = value; }), get body() { return body; } };
}

function installRetrievalRoute() {
  getMock.mockImplementation(async (path) => {
    const farmer = new URL(`http://harvestlink.test${path}`).searchParams.get('farmerId');
    const res = response();
    await listProducts({ profile: { id: farmerId, role: 'farmer' }, query: { farmerId: farmer } }, res);
    return res.body;
  });
}

// FarmerProducts performs this filtering locally after getProductsByFarmer returns.
// This mirrors its visibleProducts predicate without adding a backend search route.
function filterVisibleProducts(products, search) {
  const queryText = search.trim().toLowerCase();
  return products.filter((product) => !queryText
    || [product.name, product.category, product.location].filter(Boolean).join(' ').toLowerCase().includes(queryText));
}

describe('IT-005 – Farmer Product Search', () => {
  beforeEach(() => {
    rows = [...databaseRows];
    getMock.mockReset();
    installRetrievalRoute();
  });

  it('retrieves the farmer listing and filters Okra locally while excluding unrelated products', async () => {
    const products = await getProductsByFarmer(farmerId);
    const visible = filterVisibleProducts(products, 'Okra');

    expect(getMock).toHaveBeenCalledWith(`/products?farmerId=${farmerId}`, { fresh: true });
    expect(products).toHaveLength(3);
    expect(visible).toHaveLength(1);
    expect(visible[0]).toMatchObject({ id: 'product-okra-005', name: 'Okra', grade: 'A', price: 120, quantity: 5, unit: 'kg', status: 'active', farmerId });
    expect(visible.some((product) => ['Eggplant', 'Tomato'].includes(product.name))).toBe(false);
  });

  it('restores the complete listing when the search is cleared and does not duplicate records', async () => {
    const products = await getProductsByFarmer(farmerId);
    const visible = filterVisibleProducts(products, '');
    expect(visible.map((product) => product.name)).toEqual(['Okra', 'Eggplant', 'Tomato']);
    expect(new Set(visible.map((product) => product.id)).size).toBe(visible.length);
    expect(visible.every((product) => product.farmerId === farmerId)).toBe(true);
  });

  it('returns the actual empty-results state for a nonexistent product search', async () => {
    const products = await getProductsByFarmer(farmerId);
    expect(filterVisibleProducts(products, 'Pineapple')).toEqual([]);
  });
});

