import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

let product;
let writes;
const farmer = { id: 'farmer-1', name: 'Farmer', role: 'farmer' };
const defaults = {
  id: 'product-1', farmer_id: farmer.id, name: 'Cabbage', category: 'Vegetables',
  grade: 'A', unit: 'kg', selling_type: 'retail', price: 55, cost_price: 30,
  quantity: 100, location: 'Mandaue City', status: 'active',
  wholesale_price: 48, wholesale_min_quantity: 10,
};

// Exercise the real handlers and serializers with an in-memory database boundary.
mock.module('../src/lib/supabaseClient.js', {
  namedExports: {
    supabaseAdmin: {
      from(table) {
        let row;
        let action;
        const result = (single = false) => {
          if (action) {
            writes.push({ table, action, row });
            if (table === 'products') product = { ...product, ...row };
            return { data: { id: 'saved-1', ...row }, error: null };
          }
          const data = table === 'products' ? [product] : table === 'profiles' ? [farmer] : [];
          return { data: single ? data[0] : data, error: null };
        };
        return {
          select() { return this; }, eq() { return this; }, in() { return this; },
          order() { return this; }, limit() { return this; },
          insert(value) { row = value; action = 'insert'; return this; },
          update(value) { row = value; action = 'update'; return this; },
          single() {
            const response = result(true);
            if (action && table === 'products') response.data = product;
            return Promise.resolve(response);
          },
          then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
        };
      },
    },
  },
});
mock.module('../src/lib/catalogRepo.js', {
  namedExports: { getCatalog: async () => ({ categories: [{ name: 'Vegetables' }], units: [{ value: 'kg' }] }) },
});
mock.module('../src/lib/historicalPriceService.js', { namedExports: { getHistoricalPriceAnalysis: async () => null } });
mock.module('../src/lib/notify.js', { namedExports: { createNotification: async () => {} } });
mock.module('../src/lib/deliveryFee.js', {
  namedExports: { calculateDeliveryFee: async () => ({ fee: 40, distanceKm: 2, durationMinutes: 10, tierLabel: 'Local' }) },
});
mock.module('../src/controllers/lalamove.controller.js', {
  namedExports: { createLalamoveDeliveryForOrder: async () => ({ booked: false }) },
});

const { createProduct, updateProduct, applyDiscount } = await import('../src/controllers/products.controller.js');
const { createOrder } = await import('../src/controllers/orders.controller.js');

beforeEach(() => { product = { ...defaults }; writes = []; });

async function invoke(handler, body, profile = farmer) {
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; } };
  await handler({ body, profile, params: { id: product.id } }, response);
  return response;
}

function listing(overrides = {}) {
  return {
    name: 'Cabbage', category: 'Vegetables', unit: 'kg', price: 55, costPrice: 30,
    quantity: 100, location: 'Mandaue City', sellingType: 'retail', allowDuplicate: true,
    wholesaleEnabled: true, wholesalePrice: '48', wholesaleMinQuantity: '10', ...overrides,
  };
}

test('creating and merging listings persist and serialize the farmer-approved tier', async () => {
  const created = await invoke(createProduct, listing());
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.wholesalePrice, 48);
  assert.equal(created.body.wholesaleMinQuantity, 10);
  assert.equal(writes[0].row.wholesale_price, 48);
  const merged = await invoke(createProduct, listing({ allowDuplicate: false, wholesalePrice: 45 }));
  assert.equal(merged.body.merged, true);
  assert.equal(merged.body.quantity, 200);
  assert.equal(merged.body.wholesalePrice, 45);
});

test('create and edit reject non-positive, non-finite and over-precise tier inputs before writing', async () => {
  for (const handler of [createProduct, updateProduct]) {
    for (const wholesalePrice of [-1, 0, '', 'Infinity', 'invalid', 55, 48.001]) {
      await assert.rejects(invoke(handler, listing({ wholesalePrice })), { status: 400 });
    }
    for (const wholesaleMinQuantity of [-1, 0, '', 'Infinity', 'invalid', 101, 10.001]) {
      await assert.rejects(invoke(handler, listing({ wholesaleMinQuantity })), { status: 400 });
    }
  }
  assert.equal(writes.length, 0);
});

test('partial edits preserve tiers after stock depletion and disabling clears both fields', async () => {
  product.quantity = 3;
  const edited = await invoke(updateProduct, { description: 'Updated description' });
  assert.equal(edited.body.wholesalePrice, 48);
  assert.equal(edited.body.wholesaleMinQuantity, 10);
  await assert.rejects(invoke(updateProduct, { wholesaleMinQuantity: 11 }), { status: 400 });
  const disabled = await invoke(updateProduct, { wholesaleEnabled: false });
  assert.equal(disabled.body.wholesalePrice, null);
  assert.equal(disabled.body.wholesaleMinQuantity, null);
});

test('wholesale-only listings clear hidden dual-price settings and retain their own price and MOQ', async () => {
  const response = await invoke(updateProduct, { sellingType: 'wholesale', moq: 5, wholesaleEnabled: true });
  assert.equal(response.body.price, 55);
  assert.equal(response.body.moq, 5);
  assert.equal(response.body.wholesalePrice, null);
  assert.equal(response.body.wholesaleMinQuantity, null);
});

test('retail discounts cannot meet or undercut the wholesale price', async () => {
  await assert.rejects(invoke(createProduct, listing({ discountPercent: 20 })), { status: 400 });
  await assert.rejects(invoke(applyDiscount, { percent: 20 }), { status: 400 });
  await assert.rejects(invoke(updateProduct, { price: 48 }), { status: 400 });
  assert.equal(writes.length, 0);
  const discounted = await invoke(applyDiscount, { percent: 10 });
  assert.equal(discounted.body.price, 49.5);
  assert.equal(discounted.body.wholesalePrice, 48);
});

test('server order prices follow saved thresholds and ignore client-supplied prices', async () => {
  for (const [quantity, price] of [[9, 55], [10, 48], [25, 48]]) {
    const response = await invoke(createOrder, {
      productId: product.id, quantity, paymentMethod: 'cod', deliveryMethod: 'farmer_delivery',
      deliveryMunicipality: 'Cebu City', unitPrice: 1, wholesalePrice: 1, totalAmount: 1,
    }, { id: 'buyer-1', role: 'buyer', name: 'Buyer' });
    assert.equal(response.body.unitPrice, price);
    assert.equal(response.body.totalAmount, quantity * price + 40);
  }
  assert.deepEqual(writes.filter((entry) => entry.table === 'orders').map((entry) => entry.row.unit_price), [55, 48, 48]);
});

test('legacy wholesale orders retain their price while enforcing MOQ and available stock', async () => {
  product = { ...defaults, price: 32, selling_type: 'wholesale', moq: 5, wholesale_price: null, wholesale_min_quantity: null };
  const order = { productId: product.id, quantity: 5, paymentMethod: 'cod', deliveryMethod: 'buyer_pickup' };
  const buyer = { id: 'buyer-1', role: 'buyer', name: 'Buyer' };
  for (const quantity of [4, 101]) {
    await assert.rejects(invoke(createOrder, { ...order, quantity }, buyer), { status: 400 });
  }
  assert.equal(writes.length, 0);
  const response = await invoke(createOrder, order, buyer);
  assert.equal(response.body.unitPrice, 32);
  assert.equal(response.body.totalAmount, 5 * 32 + 40);
});
