import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  DUPLICATE_PRODUCT_ERROR_CODE,
  DUPLICATE_PRODUCT_ERROR_MESSAGE,
  DUPLICATE_PRODUCT_ERROR_TITLE,
} from '../shared/productDuplicate.js';

const productsTable = [];

function createBuilder(table) {
  const filters = [];
  let mode = 'select';
  let payload = null;

  const matches = (row) => filters.every(([col, val]) => row[col] === val);

  const execute = async () => {
    if (table === 'products') {
      if (mode === 'insert') {
        const created = { id: `prod-${productsTable.length + 1}`, ...payload };
        productsTable.push(created);
        return { data: created, error: null };
      }
      if (mode === 'update') {
        const target = productsTable.find(matches);
        if (!target) return { data: null, error: null };
        Object.assign(target, payload);
        return { data: target, error: null };
      }
      return { data: productsTable.filter(matches), error: null };
    }
    if (table === 'profiles') {
      return { data: [{ id: 'farmer-1', name: 'Farmer One', verification_status: 'verified' }], error: null };
    }
    if (table === 'ratings') {
      return { data: [], error: null };
    }
    return { data: [], error: null };
  };

  const chain = {
    select: () => chain,
    eq: (col, val) => { filters.push([col, val]); return chain; },
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    insert: (row) => { mode = 'insert'; payload = row; return chain; },
    update: (row) => { mode = 'update'; payload = row; return chain; },
    single: async () => {
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
      units: [{ value: 'kg', label: 'kg' }, { value: 'sack', label: 'sack' }],
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

const { createProduct, updateProduct } = await import('../src/controllers/products.controller.js');

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

const farmer = { id: 'farmer-1', role: 'farmer', name: 'Farmer One', verification_status: 'verified' };

test('blocks duplicate Retail and Wholesale active listings without auto-merging stock', async () => {
  productsTable.length = 0;

  const retailFirst = await invoke(createProduct, {
    profile: farmer,
    body: {
      name: 'Cabbage',
      category: 'Vegetables',
      grade: 'A',
      sellingType: 'retail',
      unit: 'kg',
      price: 60,
      quantity: 30,
      location: 'Cebu City',
      expirationDate: '2026-12-20',
    },
  });
  assert.equal(retailFirst.status, 201);

  // Changing capitalization/spaces, price, and quantity must still be blocked
  await assert.rejects(
    invoke(createProduct, {
      profile: farmer,
      body: {
        name: '  cabbage  ',
        category: 'Vegetables',
        grade: 'A',
        sellingType: 'retail',
        unit: 'kg',
        price: 75,
        quantity: 90,
        location: 'Cebu City',
        expirationDate: '2026-12-20',
      },
    }),
    (err) => err.status === 409
      && err.code === DUPLICATE_PRODUCT_ERROR_CODE
      && err.title === DUPLICATE_PRODUCT_ERROR_TITLE
      && err.message === DUPLICATE_PRODUCT_ERROR_MESSAGE
      && err.existingProductId === retailFirst.body.id,
  );
  // Existing stock must NOT have been auto-increased
  assert.equal(productsTable.length, 1);
  assert.equal(productsTable[0].quantity, 30);

  // Wholesale listing of the same commodity is ALLOWED
  const wholesaleFirst = await invoke(createProduct, {
    profile: farmer,
    body: {
      name: 'Cabbage',
      category: 'Vegetables',
      grade: 'A',
      sellingType: 'wholesale',
      moq: 20,
      unit: 'kg',
      price: 50,
      quantity: 100,
      location: 'Cebu City',
      expirationDate: '',
    },
  });
  assert.equal(wholesaleFirst.status, 201);

  // Duplicate Wholesale listing with empty expiration date is BLOCKED
  await assert.rejects(
    invoke(createProduct, {
      profile: farmer,
      body: {
        name: 'CABBAGE',
        category: 'Vegetables',
        grade: 'A',
        sellingType: 'wholesale',
        moq: 25,
        unit: 'kg',
        price: 48,
        quantity: 120,
        location: 'Cebu City',
        expirationDate: null,
      },
    }),
    (err) => err.status === 409
      && err.code === DUPLICATE_PRODUCT_ERROR_CODE
      && err.existingProductId === wholesaleFirst.body.id,
  );
  assert.equal(productsTable.length, 2);
});

test('allows separate listings for different grade or expiration date, and excludes self when editing', async () => {
  productsTable.length = 0;

  const first = await invoke(createProduct, {
    profile: farmer,
    body: {
      name: 'Tomatoes',
      category: 'Vegetables',
      grade: 'A',
      sellingType: 'retail',
      unit: 'kg',
      price: 70,
      quantity: 40,
      location: 'Cebu City',
      expirationDate: '2026-12-10',
    },
  });
  const secondGrade = await invoke(createProduct, {
    profile: farmer,
    body: {
      name: 'Tomatoes',
      category: 'Vegetables',
      grade: 'B',
      sellingType: 'retail',
      unit: 'kg',
      price: 55,
      quantity: 40,
      location: 'Cebu City',
      expirationDate: '2026-12-10',
    },
  });
  const secondExpiry = await invoke(createProduct, {
    profile: farmer,
    body: {
      name: 'Tomatoes',
      category: 'Vegetables',
      grade: 'A',
      sellingType: 'retail',
      unit: 'kg',
      price: 70,
      quantity: 40,
      location: 'Cebu City',
      expirationDate: '2026-12-25',
    },
  });
  assert.equal(first.status, 201);
  assert.equal(secondGrade.status, 201);
  assert.equal(secondExpiry.status, 201);

  // Editing own product (updating stock & price) succeeds because self is excluded
  const selfEdited = await invoke(updateProduct, {
    profile: farmer,
    params: { id: first.body.id },
    body: { price: 72, quantity: 65 },
  });
  assert.equal(selfEdited.status, 200);
  assert.equal(selfEdited.body.quantity, 65);

  // Editing secondGrade to collide with first (changing grade B -> A) is blocked with 409
  await assert.rejects(
    invoke(updateProduct, {
      profile: farmer,
      params: { id: secondGrade.body.id },
      body: { grade: 'A' },
    }),
    (err) => err.status === 409
      && err.code === DUPLICATE_PRODUCT_ERROR_CODE
      && err.existingProductId === first.body.id,
  );
});
