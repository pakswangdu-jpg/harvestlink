import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let overrideRows = [];
let psaPoints = [];
let psaFetchCount = 0;
const supabaseAdmin = {
  from() {
    const query = {
      select() { return this; },
      eq() { return this; },
      then(resolve, reject) {
        return Promise.resolve({ data: overrideRows, error: null }).then(resolve, reject);
      },
    };
    return query;
  },
};
mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin } });
mock.module('../src/lib/psaPriceService.js', {
  namedExports: {
    fetchAnnualPriceTrend: async () => {
      psaFetchCount += 1;
      return psaPoints;
    },
  },
});
const { getServerPriceReviewReference, resolveEffectiveReference } = await import('../src/lib/effectiveMarketPrice.js');

function override(overrides = {}) {
  return {
    commodity_id: '42',
    commodity_label: 'Potato',
    reference_price: 70,
    reference_year: 2025,
    unit: 'kg',
    source: 'admin_entered',
    effective_date: '2025-01-01',
    is_active: true,
    ...overrides,
  };
}

test('active admin reference takes priority over newer PSA data', async () => {
  overrideRows = [override()];
  psaPoints = [{ year: 2026, price: 99 }];
  psaFetchCount = 0;

  const result = await resolveEffectiveReference('42');
  assert.equal(result.reference.price, 70);
  assert.equal(result.reference.source, 'admin_entered');
  assert.equal(psaFetchCount, 0);
});

test('future-dated admin references are not active yet and PSA remains the fallback', async () => {
  const tomorrow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  overrideRows = [override({ effective_date: tomorrow })];
  psaPoints = [{ year: 2024, price: 35 }, { year: 2025, price: null }, { year: 2026, price: 41 }];
  psaFetchCount = 0;

  const result = await resolveEffectiveReference('42');
  assert.equal(result.reference.price, 41);
  assert.equal(result.reference.source, 'psa');
  assert.equal(result.reference.year, 2026);
  assert.equal(psaFetchCount, 1);
});

test('fixed reference units convert to a per-kilogram review value', async () => {
  overrideRows = [override({
    reference_price: 0.2,
    unit: 'g',
    source: 'verified_local_market',
  })];

  const result = await getServerPriceReviewReference('Potato', 'kg', 1);
  assert.equal(result.referencePrice, 200);
  assert.equal(result.referenceSource, 'verified_local_market');
  assert.equal(result.unit, 'g');
});
