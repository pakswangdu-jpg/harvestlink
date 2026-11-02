import assert from 'node:assert/strict';
import { test } from 'node:test';

test('demand forecasts keep farmer listings and buyer demand separate by listed unit', async (t) => {
  const now = Date.now();
  const products = [
    {
      id: 'tomato-kg', name: 'Tomato', category: 'Vegetables', price: 50,
      unit: 'kg', location: 'Cebu City', status: 'active', created_at: new Date(now).toISOString(),
    },
    {
      id: 'tomato-sack', name: 'Tomato', category: 'Vegetables', price: 500,
      unit: 'sack', location: 'Cebu City', status: 'active', created_at: new Date(now).toISOString(),
    },
  ];
  const orders = [
    {
      product_id: 'tomato-kg', product_name: 'Tomato', quantity: 4, unit_price: 50,
      status: 'completed', created_at: new Date(now - 86400000).toISOString(),
    },
    {
      product_id: 'tomato-sack', product_name: 'Tomato', quantity: 2, unit_price: 500,
      status: 'completed', created_at: new Date(now - 86400000).toISOString(),
    },
  ];
  t.mock.module('../src/lib/supabaseClient.js', {
    namedExports: {
      supabaseAdmin: {
        from(table) {
          const result = { data: table === 'products' ? products : orders, error: null };
          return {
            select() { return this; },
            eq() { return this; },
            gte() { return this; },
            then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
          };
        },
      },
    },
  });
  t.mock.module('../src/lib/weatherService.js', {
    namedExports: { getWeatherForMunicipality: async () => null },
  });
  t.mock.module('../src/lib/psaPriceService.js', {
    namedExports: { fetchAnnualPriceTrend: async () => [] },
  });
  t.mock.module('../src/lib/geminiService.js', {
    namedExports: { generateForecastInsights: async () => null },
  });
  const { getCropForecastDetail, getDemandForecast } = await import('../src/controllers/forecast.controller.js');
  let response;
  await getDemandForecast(
    { query: { period: '7_days' }, profile: { municipality: 'Cebu City' } },
    { json: (data) => { response = data; } },
  );

  assert.equal(response.crops.length, 2);
  const perUnit = Object.fromEntries(response.crops.map((entry) => [entry.unit, entry]));
  assert.deepEqual(Object.keys(perUnit).sort(), ['kg', 'sack']);
  assert.equal(perUnit.kg.referencePrice, 50);
  assert.equal(perUnit.kg.quantityOrdered, 4);
  assert.equal(perUnit.sack.referencePrice, 500);
  assert.equal(perUnit.sack.quantityOrdered, 2);
  assert.notEqual(perUnit.kg.forecastKey, perUnit.sack.forecastKey);

  const detailRequest = {
    params: { cropName: 'Tomato' },
    query: { unit: 'sack', municipality: 'Cebu City', period: '7_days' },
    profile: { municipality: 'Cebu City' },
  };
  let detail;
  await getCropForecastDetail(detailRequest, { json: (data) => { detail = data; } });
  assert.equal(detail.unit, 'sack');
  assert.equal(detail.referencePrice, 500);
  assert.deepEqual(detail.historicalChart.map((point) => point.price), [500]);

  await assert.rejects(
    getCropForecastDetail({ ...detailRequest, query: { period: '7_days' } }, { json() {} }),
    /A listing unit is required/,
  );
});
