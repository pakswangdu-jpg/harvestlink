import { beforeEach, describe, expect, it, vi } from 'vitest';

const farmerId = 'integration-farmer-001';
const databaseCalls = [];
let insertedRow;

const savedRow = () => ({
  id: 'integration-product-001', farmer_id: farmerId, name: 'Cabbage', category: 'Vegetables', grade: 'A',
  selling_type: 'retail', price: 50, quantity: 10, unit: 'kg', location: 'Mandaue City',
  description: 'Fresh vegetables for integration testing', image_url: null, image_urls: [], status: 'active',
  price_review: null, cost_price: 40, wholesale_price: null, wholesale_min_quantity: null, moq: null,
  kg_per_unit: null, original_price: null, discount_percent: null, expiration_date: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
});

function query(table) {
  const state = { operation: 'select' };
  const result = table === 'profiles'
    ? { data: [{ id: farmerId, name: 'Integration Farmer', farm_name: 'Test Farm', verification_status: 'verified' }], error: null }
    : table === 'ratings' ? { data: [], error: null } : { data: [], error: null };
  const chain = {
    select() { if (state.operation !== 'insert') state.operation = 'select'; return chain; },
    insert(row) { state.operation = 'insert'; insertedRow = savedRow(); databaseCalls.push({ table, operation: 'insert', row }); return chain; },
    update() { state.operation = 'update'; return chain; },
    eq() { return chain; }, in() { return chain; }, order() { return chain; }, limit() { return chain; },
    single() { return Promise.resolve(state.operation === 'insert' ? { data: insertedRow, error: null } : { data: result.data?.[0] || null, error: null }); },
    then(resolve, reject) { return Promise.resolve(state.operation === 'insert' ? { data: insertedRow, error: null } : result).then(resolve, reject); },
  };
  return chain;
}

vi.mock('../../../backend/src/lib/supabaseClient.js', () => ({ supabaseAdmin: { from: (table) => query(table), rpc: vi.fn() } }));
vi.mock('../../../backend/src/lib/catalogRepo.js', () => ({ getCatalog: vi.fn(async () => ({ categories: [{ name: 'Vegetables' }], units: [{ value: 'kg' }] })) }));
vi.mock('../../../backend/src/lib/effectiveMarketPrice.js', () => ({ getServerPriceReviewReference: vi.fn(async () => null) }));
vi.mock('../../../backend/src/lib/priceReviewNotifications.js', () => ({ notifyAdminsOfPriceReview: vi.fn(), notifyFarmerOfPriceDecision: vi.fn() }));
vi.mock('../../../backend/src/middleware/requireAuth.js', () => ({ invalidateAuthCacheForUser: vi.fn() }));

const { createProduct } = await import('../../../backend/src/controllers/products.controller.js');

describe('IT-001 – Farmer Add Product', () => {
  beforeEach(() => { databaseCalls.length = 0; insertedRow = null; });

  it('passes validated product data from the request handler to the database adapter once', async () => {
    const req = { profile: { id: farmerId, role: 'farmer' }, body: {
      name: 'Cabbage', category: 'Vegetables', grade: 'A', sellingType: 'retail', price: 50, costPrice: 40,
      quantity: 10, unit: 'kg', location: 'Mandaue City', description: 'Fresh vegetables for integration testing', allowDuplicate: true,
    } };
    let responseBody;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn((body) => { responseBody = body; }) };

    await createProduct(req, res);

    expect(databaseCalls).toHaveLength(1);
    expect(databaseCalls[0]).toMatchObject({ table: 'products', operation: 'insert' });
    expect(databaseCalls[0].row).toMatchObject({ farmer_id: farmerId, name: 'Cabbage', category: 'Vegetables', grade: 'A', selling_type: 'retail', price: 50, quantity: 10, unit: 'kg', location: 'Mandaue City', description: req.body.description, status: 'active' });
    expect(responseBody).toMatchObject({ id: insertedRow.id, farmerId, name: 'Cabbage', price: 50, quantity: 10, status: 'active' });
    console.log('Test Case ID: IT-001');
    console.log('Module: Farmer Product Management');
    console.log('Expected Result: Product data is successfully processed with correct Farmer ownership and listing details.');
    console.log('Actual Result: Validated request reached the mocked database adapter with one insert and returned the saved product.');
    console.log('Outcome: PASS');
  });
});
