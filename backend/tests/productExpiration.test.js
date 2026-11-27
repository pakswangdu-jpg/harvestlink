import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  EXPIRED_PRODUCT_ERROR_CODE,
  EXPIRED_PRODUCT_ERROR_MESSAGE,
  EXPIRED_PRODUCT_ERROR_TITLE,
  getTodayInPhilippines,
} from '../shared/expiration.js';

let currentProduct = null;
const productsTable = [];
const orderWrites = [];

function createBuilder(table) {
  const filters = [];
  let mode = 'select';
  let payload = null;

  const matches = (row) => filters.every(([op, col, val]) => {
    if (op === 'eq') return row[col] === val;
    if (op === 'is') return val === null ? row[col] == null : row[col] === val;
    return true;
  });

  const execute = async () => {
    if (table === 'products') {
      if (mode === 'insert') {
        const created = { id: `prod-${productsTable.length + 1}`, ...payload };
        productsTable.push(created);
        return { data: created, error: null };
      }
      if (mode === 'update') {
        const target = productsTable.find(matches);
        Object.assign(target, payload);
        return { data: target, error: null };
      }
      const list = currentProduct && filters.some(([, col, val]) => col === 'id' && val === currentProduct.id)
        ? [currentProduct]
        : productsTable.filter(matches);
      return { data: list, error: null };
    }
    if (table === 'profiles') {
      return { data: [{ id: 'farmer-1', name: 'Farmer One', verification_status: 'verified' }], error: null };
    }
    if (table === 'ratings') {
      return { data: [], error: null };
    }
    if (table === 'orders' && mode === 'insert') {
      orderWrites.push(payload);
      return { data: { id: 'order-1', ...payload }, error: null };
    }
    return { data: [], error: null };
  };

  const chain = {
    select: () => chain,
    eq: (col, val) => { filters.push(['eq', col, val]); return chain; },
    is: (col, val) => { filters.push(['is', col, val]); return chain; },
    in: () => chain,
    or: () => chain,
    gt: () => chain,
    order: () => chain,
    limit: () => chain,
    insert: (row) => { mode = 'insert'; payload = row; return chain; },
    update: (row) => { mode = 'update'; payload = row; return chain; },
    single: async () => {
      const { data, error } = await execute();
      return { data: Array.isArray(data) ? (data[0] || null) : data, error };
    },
    maybeSingle: async () => {
      const { data, error } = await execute();
      return { data: Array.isArray(data) ? (data[0] || null) : data, error };
    },
    then: (resolve, reject) => execute().then(resolve, reject),
  };
  return chain;
}

mock.module('../src/lib/supabaseClient.js', {
  namedExports: {
    supabaseAdmin: { from: createBuilder },
  },
});

mock.module('../src/lib/catalogRepo.js', {
  namedExports: {
    getCatalog: async () => ({
      categories: [{ name: 'Vegetables' }],
      units: [{ value: 'kg', label: 'kg' }],
    }),
  },
});

mock.module('../src/lib/effectiveMarketPrice.js', {
  namedExports: {
    getServerPriceReviewReference: async () => null,
  },
});

mock.module('../src/lib/notify.js', {
  namedExports: {
    createNotification: async () => ({}),
  },
});

mock.module('../src/lib/deliveryFee.js', {
  namedExports: {
    calculateDeliveryFee: async () => ({ fee: 50, distanceKm: 5, durationMinutes: 15, tierLabel: 'Local' }),
  },
});

const { createOrder, getCheckoutQuote } = await import('../src/controllers/orders.controller.js');
const { createProduct, getProduct } = await import('../src/controllers/products.controller.js');

const invoke = async (handler, req) => {
  let status = 200;
  let body = null;
  const res = {
    status(code) { status = code; return this; },
    json(data) { body = data; return this; },
    setHeader() {},
  };
  await handler(req, res);
  return { status, body };
};

test('backend checkout and quote reject expired Retail and Wholesale products with professional message', async () => {
  const buyer = { id: 'buyer-1', role: 'buyer', name: 'Buyer One', municipality: 'Cebu City' };

  for (const sellingType of ['retail', 'wholesale']) {
    currentProduct = {
      id: `prod-${sellingType}-expired`,
      farmer_id: 'farmer-1',
      name: 'Cabbage',
      category: 'Vegetables',
      grade: 'A',
      unit: 'kg',
      price: 60,
      quantity: 50,
      selling_type: sellingType,
      moq: sellingType === 'wholesale' ? 10 : null,
      location: 'Cebu City',
      status: 'active',
      expiration_date: '2020-01-01',
    };

    const body = {
      productId: currentProduct.id,
      quantity: 10,
      deliveryMethod: 'farmer_delivery',
      deliveryMunicipality: 'Cebu City',
      paymentMethod: 'cod',
    };

    await assert.rejects(
      invoke(createOrder, { body, profile: buyer }),
      (err) => err.status === 400
        && err.code === EXPIRED_PRODUCT_ERROR_CODE
        && err.title === EXPIRED_PRODUCT_ERROR_TITLE
        && err.message === EXPIRED_PRODUCT_ERROR_MESSAGE,
    );

    await assert.rejects(
      invoke(getCheckoutQuote, { body, profile: buyer }),
      (err) => err.status === 400
        && err.code === EXPIRED_PRODUCT_ERROR_CODE
        && err.title === EXPIRED_PRODUCT_ERROR_TITLE
        && err.message === EXPIRED_PRODUCT_ERROR_MESSAGE,
    );
  }

  assert.equal(orderWrites.length, 0);
});

test('getProduct blocks buyers from expired listings but keeps them accessible to the owning farmer', async () => {
  currentProduct = {
    id: 'prod-expired-view',
    farmer_id: 'farmer-1',
    name: 'Tomatoes',
    category: 'Vegetables',
    grade: 'A',
    unit: 'kg',
    price: 70,
    quantity: 20,
    selling_type: 'retail',
    location: 'Cebu City',
    status: 'active',
    expiration_date: '2020-01-01',
  };

  await assert.rejects(
    invoke(getProduct, { params: { id: currentProduct.id }, profile: { id: 'buyer-1', role: 'buyer' } }),
    (err) => err.status === 404
      && err.code === EXPIRED_PRODUCT_ERROR_CODE
      && err.title === EXPIRED_PRODUCT_ERROR_TITLE
      && err.message === EXPIRED_PRODUCT_ERROR_MESSAGE,
  );

  const farmerView = await invoke(getProduct, {
    params: { id: currentProduct.id },
    profile: { id: 'farmer-1', role: 'farmer' },
  });
  assert.equal(farmerView.status, 200);
  assert.equal(farmerView.body.expirationDate, '2020-01-01');
});

test('farmers can create multiple listings of the same commodity with different expiration dates', async () => {
  productsTable.length = 0;
  currentProduct = null;
  const farmer = { id: 'farmer-1', role: 'farmer', name: 'Farmer One', verification_status: 'verified' };
  const today = getTodayInPhilippines();

  const first = await invoke(createProduct, {
    profile: farmer,
    body: {
      name: 'Carrots',
      category: 'Vegetables',
      grade: 'A',
      unit: 'kg',
      sellingType: 'retail',
      price: 65,
      quantity: 30,
      location: 'Cebu City',
      expirationDate: today,
    },
  });
  const second = await invoke(createProduct, {
    profile: farmer,
    body: {
      name: 'Carrots',
      category: 'Vegetables',
      grade: 'A',
      unit: 'kg',
      sellingType: 'retail',
      price: 65,
      quantity: 40,
      location: 'Cebu City',
      expirationDate: '2027-01-15',
    },
  });

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(second.body.merged, undefined);
  assert.equal(productsTable.length, 2);
  assert.equal(productsTable[0].expiration_date, today);
  assert.equal(productsTable[1].expiration_date, '2027-01-15');
});
