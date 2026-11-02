import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const productRow = {
  id: 'product-1',
  farmer_id: 'farmer-1',
  name: 'Cabbage',
  category: 'Vegetables',
  price: 45,
  quantity: 20,
  location: 'Mandaue City',
  status: 'active',
  image_url: 'https://images.test/cabbage.jpg',
};

const queryCalls = [];
mock.module('../src/lib/supabaseClient.js', {
  namedExports: {
    supabaseAdmin: {
      from(table) {
        return {
          select(fields) { queryCalls.push([table, 'select', fields]); return this; },
          eq(field, value) { queryCalls.push([table, 'eq', field, value]); return this; },
          gt(field, value) { queryCalls.push([table, 'gt', field, value]); return this; },
          or(value) { queryCalls.push([table, 'or', value]); return this; },
          order(field, options) { queryCalls.push([table, 'order', field, options]); return this; },
          in(field, values) { queryCalls.push([table, 'in', field, values]); return this; },
          then(resolve, reject) {
            const data = table === 'products'
              ? [productRow]
              : table === 'profiles'
                ? [{ id: 'farmer-1', name: 'Juan Dela Cruz', farm_name: 'Green Valley Farm', verification_status: 'verified' }]
                : [];
            return Promise.resolve({ data, error: null }).then(resolve, reject);
          },
        };
      },
    },
  },
});

const { listMarketplaceProducts } = await import('../src/controllers/products.controller.js');

test('marketplace search endpoint returns approved active listings with searchable farmer identity', async () => {
  let response;
  const headers = {};
  await listMarketplaceProducts({}, {
    setHeader(name, value) { headers[name] = value; },
    json(value) { response = value; },
  });

  assert.equal(response.length, 1);
  assert.equal(response[0].farmerName, 'Juan Dela Cruz');
  assert.equal(response[0].farmerFarmName, 'Green Valley Farm');
  assert.equal(response[0].location, 'Mandaue City');
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.ok(queryCalls.some((call) => call[0] === 'products' && call[1] === 'or'
    && call[2].includes('and(status.eq.active,quantity.gt.0)')
    && call[2].includes('and(status.eq.inactive,quantity.eq.0)')));
  assert.ok(queryCalls.some((call) => call[0] === 'products' && call[1] === 'or' && call[2].includes('approved')));
});
