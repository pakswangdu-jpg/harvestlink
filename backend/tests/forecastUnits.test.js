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

test('unitless orders and preview requests resolve crop forecast details without waiting on AI', async (t) => {
  const now = Date.now();
  let insightCalls = 0;
  const products = [
    {
      id: 'carrot-kg', name: 'Carrot', category: 'Vegetables', price: 60,
      unit: 'kg', location: 'Cebu City', status: 'active', created_at: new Date(now).toISOString(),
    },
    {
      id: 'carrot-plain', name: 'Carrot', category: 'Vegetables', price: 50,
      unit: null, location: 'Cebu City', status: 'active', created_at: new Date(now).toISOString(),
    },
  ];
  const orders = [
    {
      product_id: null, product_name: 'Coconut', quantity: 5, unit_price: 10,
      status: 'completed', created_at: new Date(now - 86400000).toISOString(),
    },
    {
      product_id: 'carrot-plain', product_name: 'Carrot', quantity: 3, unit_price: 50,
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
    namedExports: {
      generateForecastInsights: async () => {
        insightCalls += 1;
        return { summary: 'AI summary', recommendation: 'AI recommendation' };
      },
    },
  });

  const { getCropForecastDetail } = await import(`../src/controllers/forecast.controller.js?case=${now}`);

  let coconutDetail;
  await getCropForecastDetail(
    { params: { cropName: 'Coconut' }, query: { unit: '', period: '7_days', preview: '1' }, profile: { municipality: '' } },
    { json: (data) => { coconutDetail = data; } },
  );
  assert.equal(coconutDetail.crop, 'Coconut');
  assert.equal(coconutDetail.referencePrice, 10);
  assert.equal(coconutDetail.aiSummary, null);
  assert.equal(insightCalls, 0);

  let unitlessCarrotDetail;
  await getCropForecastDetail(
    { params: { cropName: 'Carrot' }, query: { unit: '', period: '7_days', preview: '1' }, profile: { municipality: '' } },
    { json: (data) => { unitlessCarrotDetail = data; } },
  );
  assert.equal(unitlessCarrotDetail.unit, null);
  assert.equal(unitlessCarrotDetail.referencePrice, 50);
  assert.equal(insightCalls, 0);

  let fullCarrotDetail;
  await getCropForecastDetail(
    { params: { cropName: 'Carrot' }, query: { unit: 'kg', period: '7_days' }, profile: { municipality: '' } },
    { json: (data) => { fullCarrotDetail = data; } },
  );
  assert.equal(fullCarrotDetail.unit, 'kg');
  assert.equal(fullCarrotDetail.aiSummary, 'AI summary');
  assert.equal(insightCalls, 1);
});
