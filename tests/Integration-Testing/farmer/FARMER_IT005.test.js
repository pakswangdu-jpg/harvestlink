import { beforeEach, describe, expect, it, vi } from 'vitest';

const { deleteMock } = vi.hoisted(() => ({ deleteMock: vi.fn() }));
const farmerId = 'integration-farmer-005';
const productId = 'integration-okra-delete-005';
const otherProductId = 'integration-cabbage-005';
let rows;
let databaseDeleteCalls;

function seedRows() {
  return [
    {
      id: productId, farmer_id: farmerId, name: 'Okra', category: 'Vegetables', grade: 'A', selling_type: 'retail',
      price: 120, quantity: 5, unit: 'kg', location: 'Mandaue City', status: 'active', price_review: null,
      image_url: null, image_urls: [], created_at: '2026-11-20T02:00:00.000Z', updated_at: '2026-11-24T02:00:00.000Z',
    },
    {
      id: otherProductId, farmer_id: farmerId, name: 'Cabbage', category: 'Vegetables', grade: 'A', selling_type: 'retail',
      price: 50, quantity: 10, unit: 'kg', location: 'Mandaue City', status: 'active', price_review: null,
      image_url: null, image_urls: [], created_at: '2026-11-21T02:00:00.000Z', updated_at: '2026-11-24T02:00:00.000Z',
    },
  ];
}

function query(table) {
  const state = { operation: 'select', filters: [] };
  const chain = {
    select() { return chain; },
    delete() { state.operation = 'delete'; return chain; },
    order() { return chain; },
    eq(column, value) { state.filters.push({ column, value }); return chain; },
    in() { return chain; },
    or() { return chain; },
    single() {
      const id = state.filters.find(({ column }) => column === 'id')?.value;
      return Promise.resolve({ data: rows.find((row) => row.id === id) || null, error: null });
    },
    then(resolve, reject) {
      if (state.operation === 'delete') {
        const id = state.filters.find(({ column }) => column === 'id')?.value;
        databaseDeleteCalls.push({ table, id });
        rows = rows.filter((row) => row.id !== id);
        return Promise.resolve({ error: null }).then(resolve, reject);
      }
      if (table === 'profiles') {
        return Promise.resolve({ data: [{ id: farmerId, name: 'Integration Farmer', farm_name: 'Test Farm', verification_status: 'verified' }], error: null }).then(resolve, reject);
      }
      if (table === 'ratings') return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    },
  };
  return chain;
}

vi.mock('../../../backend/src/lib/supabaseClient.js', () => ({
  supabaseAdmin: { from: (table) => query(table), rpc: vi.fn() },
}));
vi.mock('../../../src/services/apiClient.js', () => ({ apiClient: { delete: deleteMock } }));

const { deleteProduct: deleteProductController, listProducts, listMarketplaceProducts } =
  await import('../../../backend/src/controllers/products.controller.js');
const { deleteProduct } = await import('../../../src/services/productService.js');

function response() {
  let body;
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn((value) => { body = value; }),
    setHeader: vi.fn(),
    end: vi.fn(),
    get body() { return body; },
  };
}

function installDeleteRoute() {
  deleteMock.mockImplementation(async (path) => {
    const res = response();
    await deleteProductController({
      profile: { id: farmerId, role: 'farmer' },
      params: { id: path.split('/').pop() },
    }, res);
    return undefined;
  });
}

describe('IT-005 – Farmer Delete Product', () => {
  beforeEach(() => {
    rows = seedRows();
    databaseDeleteCalls = [];
    deleteMock.mockReset();
    installDeleteRoute();
  });

  it('deletes the selected Farmer product once through the real service and backend controller', async () => {
    await deleteProduct(productId);

    expect(deleteMock).toHaveBeenCalledOnce();
    expect(deleteMock).toHaveBeenCalledWith(`/products/${productId}`);
    expect(databaseDeleteCalls).toEqual([{ table: 'products', id: productId }]);
    expect(rows.some((row) => row.id === productId)).toBe(false);
    expect(rows.some((row) => row.id === otherProductId)).toBe(true);
  });

  it('removes the deleted product from the Farmer listing and marketplace visibility', async () => {
    await deleteProduct(productId);

    const farmerResponse = response();
    await listProducts({ profile: { id: farmerId, role: 'farmer' }, query: {} }, farmerResponse);
    expect(farmerResponse.body.map((row) => row.id)).toEqual([otherProductId]);

    const marketplaceResponse = response();
    await listMarketplaceProducts({ profile: { id: 'integration-buyer-005', role: 'buyer' }, query: {} }, marketplaceResponse);
    expect(marketplaceResponse.body.some((row) => row.id === productId)).toBe(false);
    expect(marketplaceResponse.body.some((row) => row.id === otherProductId)).toBe(true);
  });

  it('preserves the product when authorization fails and does not call the database delete', async () => {
    deleteMock.mockImplementation(async () => {
      await deleteProductController({
        profile: { id: 'different-farmer', role: 'farmer' },
        params: { id: productId },
      }, response());
    });

    await expect(deleteProduct(productId)).rejects.toMatchObject({ status: 403 });
    expect(databaseDeleteCalls).toHaveLength(0);
    expect(rows.find((row) => row.id === productId)).toMatchObject({ name: 'Okra', price: 120, quantity: 5 });
  });
});

