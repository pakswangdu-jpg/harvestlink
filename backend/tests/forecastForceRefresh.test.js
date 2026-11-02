import assert from 'node:assert/strict';
import { test } from 'node:test';

test('a forced demand-list refresh bypasses and replaces the server cache', async (t) => {
  const reads = { products: 0, orders: 0 };
  t.mock.module('../src/lib/supabaseClient.js', {
    namedExports: {
      supabaseAdmin: {
        from(table) {
          reads[table] += 1;
          return {
            select() { return this; },
            eq() { return this; },
            gte() { return this; },
            then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
          };
        },
      },
    },
  });
  t.mock.module('../src/lib/weatherService.js', {
    namedExports: { getWeatherForMunicipality: async () => null },
  });
  const { getDemandForecast } = await import('../src/controllers/forecast.controller.js');
  const request = { query: { period: '7_days' }, profile: { municipality: 'Cebu City' } };
  let response;
  const readForecast = () => getDemandForecast(request, { json: (data) => { response = data; } });

  await readForecast();
  assert.deepEqual(reads, { products: 1, orders: 1 });
  await readForecast();
  assert.deepEqual(reads, { products: 1, orders: 1 });

  request.query.refresh = '1';
  await readForecast();
  assert.deepEqual(reads, { products: 2, orders: 2 });
  assert.deepEqual(response.crops, []);
});
