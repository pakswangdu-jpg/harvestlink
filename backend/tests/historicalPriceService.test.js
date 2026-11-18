import assert from 'node:assert/strict';
import { test } from 'node:test';

test('historical price analysis uses exact product name and unit with cost-based recommendation', async (t) => {
  const rows = [
    { product_name: '  Tomato  ', unit: 'kg', unit_price: 40, created_at: '2026-11-01T00:00:00Z' },
    { product_name: 'TOMATO', unit: 'KG', unit_price: 50, created_at: '2026-11-02T00:00:00Z' },
    { product_name: 'tomato', unit: 'kg', unit_price: 45, created_at: '2026-11-03T00:00:00Z' },
    { product_name: 'Tomato Premium', unit: 'kg', unit_price: 80, created_at: '2026-11-04T00:00:00Z' },
    { product_name: 'Tomato', unit: 'sack', unit_price: 500, created_at: '2026-11-05T00:00:00Z' },
  ];

  t.mock.module('../src/lib/supabaseClient.js', {
    namedExports: {
      supabaseAdmin: {
        from() {
          return {
            select() { return this; },
            eq() { return this; },
            gte() { return this; },
            order() { return this; },
            limit() { return this; },
            then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject); },
          };
        },
      },
    },
  });
  t.mock.module('../src/lib/geminiService.js', {
    namedExports: { generateProductPriceInsight: async () => null },
  });

  const { getHistoricalPriceAnalysis } = await import('../src/lib/historicalPriceService.js');
  const analysis = await getHistoricalPriceAnalysis('tomato', 'kg', {
    costPrice: '35',
    quantity: '10',
  });

  assert.equal(analysis.matched, true);
  assert.equal(analysis.orderCount, 3);
  assert.equal(analysis.averagePrice, 45);
  assert.equal(analysis.lowestPrice, 40);
  assert.equal(analysis.highestPrice, 50);
  assert.equal(analysis.recommendedPrice, 45);
  assert.equal(analysis.estimatedProfit, 10);
  assert.equal(analysis.estimatedMargin, 22.22);
  assert.equal(analysis.estimatedTotal, 450);
});
