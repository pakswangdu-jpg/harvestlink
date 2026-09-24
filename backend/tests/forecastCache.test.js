import assert from 'node:assert/strict';
import { test } from 'node:test';

test('a fallback report expires after one minute while successful AI insights retain the six-hour cache', async (t) => {
  let now = Date.now();
  let insightCalls = 0;
  t.mock.method(Date, 'now', () => now);
  const insights = { summary: 'Market summary.', recommendation: 'Monitor orders.' };
  const product = {
    id: 'tomato-1', name: 'Tomato', category: 'Vegetables', price: 50,
    unit: 'kg', location: 'Cebu City', status: 'active', updated_at: new Date(now).toISOString(),
  };
  t.mock.module('../src/lib/supabaseClient.js', {
    namedExports: {
      supabaseAdmin: {
        from(table) {
          const result = { data: table === 'products' ? [product] : [], error: null };
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
  t.mock.module('../src/lib/weatherService.js', { namedExports: { getWeatherForMunicipality: async () => null } });
  t.mock.module('../src/lib/psaPriceService.js', { namedExports: { fetchAnnualPriceTrend: async () => [] } });
  t.mock.module('../src/lib/geminiService.js', {
    namedExports: { generateForecastInsights: async () => (++insightCalls === 1 ? null : insights) },
  });
  const { getCropForecastDetail } = await import('../src/controllers/forecast.controller.js');
  const request = {
    params: { cropName: 'Tomato' }, query: { municipality: 'Cebu City', period: '7_days' },
    profile: { municipality: 'Cebu City' },
  };
  let response;
  const readReport = () => getCropForecastDetail(request, { json: (data) => { response = data; } });

  await readReport();
  assert.equal(response.aiSummary, null);
  assert.equal(typeof response.forecastPrice, 'number');
  assert.equal(typeof response.recommendation, 'string');
  now += 59000;
  await readReport();
  assert.equal(insightCalls, 1);
  now += 1000;
  await readReport();
  assert.equal(insightCalls, 2);
  assert.equal(response.aiSummary, insights.summary);
  now += 5 * 60 * 1000;
  await readReport();
  assert.equal(insightCalls, 2);
  now += 6 * 60 * 60 * 1000;
  await readReport();
  assert.equal(insightCalls, 3);
});
