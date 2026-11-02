import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

const order = {
  id: 'order-1',
  buyer_id: 'buyer-1',
  farmer_id: 'farmer-1',
};
const profiles = {
  'farmer-1': {
    id: 'farmer-1',
    role: 'farmer',
    name: 'Farmer',
    farm_name: 'Green Farm',
    municipality: 'Cebu City',
    latitude: 10.3157,
    longitude: 123.8854,
    address: 'private address',
  },
  'buyer-1': {
    id: 'buyer-1',
    role: 'buyer',
    name: 'Buyer',
    municipality: 'Mandaue City',
    latitude: 10.3236,
    longitude: 123.9223,
    address: 'private address',
  },
};

mock.module('../src/lib/supabaseClient.js', {
  namedExports: {
    supabaseAdmin: {
      from(table) {
        let id;
        let fields = '';
        return {
          select(value) { fields = value; return this; },
          eq(field, value) {
            id = value;
            if (table === 'orders') assert.equal(field, 'id');
            if (table === 'profiles') assert.equal(field, 'id');
            return this;
          },
          single: async () => ({
            data: table === 'orders'
              ? order
              : Object.fromEntries(fields.split(', ').map((field) => [field, profiles[id][field]])),
            error: null,
          }),
        };
      },
    },
  },
});

const { getOrderTrackingProfiles } = await import('../src/controllers/orders.controller.js');

async function getProfiles(profile) {
  let response;
  const headers = {};
  await getOrderTrackingProfiles(
    { params: { id: order.id }, profile },
    {
      setHeader(name, value) { headers[name] = value; },
      json(value) { response = value; },
    },
  );
  return { response, headers };
}

test('order participants receive saved delivery coordinates without private address fields', async () => {
  const { response, headers } = await getProfiles({ id: 'buyer-1', role: 'buyer' });
  assert.deepEqual(response.farmer, {
    id: 'farmer-1',
    role: 'farmer',
    name: 'Farmer',
    farm_name: 'Green Farm',
    municipality: 'Cebu City',
    latitude: 10.3157,
    longitude: 123.8854,
  });
  assert.equal(response.buyer.latitude, 10.3236);
  assert.equal('address' in response.buyer, false);
  assert.equal(headers['Cache-Control'], 'no-store');
});

test('accounts unrelated to the order cannot access delivery coordinates', async () => {
  await assert.rejects(getProfiles({ id: 'other-user', role: 'buyer' }), { status: 403 });
});
