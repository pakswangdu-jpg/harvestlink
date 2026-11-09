import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let references = new Map();
let savedOverrideArgs;
const insertedUnits = [];
const supabaseAdmin = {
  from(table) {
    return {
      insert(value) {
        insertedUnits.push({ table, ...value });
        return {
          select() {
            return {
              single: async () => ({ data: { name: value.name, abbreviation: value.abbreviation }, error: null }),
            };
          },
        };
      },
    };
  },
  rpc: async (_name, args) => {
    savedOverrideArgs = args;
    return { data: [{
      commodity_id: args.p_commodity_id,
      commodity_label: args.p_commodity_label,
      reference_price: args.p_reference_price,
      reference_year: args.p_reference_year,
      unit: args.p_unit,
      source: args.p_source,
      effective_date: args.p_effective_date,
      is_active: true,
    }], error: null };
  },
};
mock.module('../src/lib/supabaseClient.js', { namedExports: { supabaseAdmin } });
mock.module('../src/lib/catalogRepo.js', {
  namedExports: {
    getCatalog: async () => ({ units: [{ value: 'kg' }, { value: 'g' }, { value: 'bag' }] }),
    invalidateCatalogCache() {},
  },
});
mock.module('../src/lib/effectiveMarketPrice.js', {
  namedExports: {
    findCommodityById: async (id) => ({ id, label: id, isCustom: false }),
    resolveEffectiveReference: async (id) => references.get(id),
  },
});
const { getRecommendation, setOverride } = await import('../src/controllers/marketPriceOverrides.controller.js');

async function invoke(commodityId, body) {
  const res = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.body = value; },
  };
  await getRecommendation({ params: { commodityId }, body }, res);
  return res;
}

test('farmer recommendation uses the active admin price and calculates quantity totals in cents', async () => {
  references = new Map([['potato', {
    commodity: { id: 'potato', label: 'Potato' },
    reference: {
      price: 70,
      unit: 'kg',
      source: 'admin_entered',
      effectiveDate: '2026-11-10',
      year: 2026,
    },
  }]]);
  const response = await invoke('potato', { unit: 'kg', quantity: '15' });
  assert.equal(response.body.referencePrice, 70);
  assert.equal(response.body.recommendedUnitPrice, 70);
  assert.equal(response.body.estimatedTotal, 1050);
  assert.equal(response.body.source, 'admin_entered');
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('recommendation uses the exact registered unit or returns unavailable without converting guesses', async () => {
  references = new Map([['custom-1', {
    commodity: { id: 'custom-1', label: 'Purple Yam' },
    reference: {
      price: 125.5,
      unit: 'bag',
      source: 'verified_local_market',
      effectiveDate: '2026-11-10',
      year: 2026,
    },
  }]]);
  const exact = await invoke('custom-1', { unit: 'bag', quantity: '2' });
  assert.equal(exact.body.recommendedUnitPrice, 125.5);
  assert.equal(exact.body.estimatedTotal, 251);
  assert.equal(exact.body.source, 'verified_local_market');

  const mismatch = await invoke('custom-1', { unit: 'kg', quantity: '2' });
  assert.equal(mismatch.body.available, false);
  assert.equal(mismatch.body.reason, 'unit_mismatch');
  assert.equal(mismatch.body.recommendedUnitPrice, null);
  assert.equal(mismatch.body.estimatedTotal, null);
});

test('missing reference data stays unavailable instead of becoming a zero recommendation', async () => {
  references = new Map([['no-price', { commodity: { id: 'no-price', label: 'No Price' }, reference: null }]]);
  const response = await invoke('no-price', { unit: 'kg', quantity: '15' });
  assert.equal(response.body.available, false);
  assert.equal(response.body.referencePrice, null);
  assert.equal(response.body.recommendedUnitPrice, null);
  assert.equal(response.body.estimatedTotal, null);
});

test('quantity validation rejects invalid, negative, and over-precise values', async () => {
  references = new Map([['potato', {
    commodity: { id: 'potato', label: 'Potato' },
    reference: { price: 70, unit: 'kg', source: 'psa', year: 2026 },
  }]]);
  for (const quantity of ['-1', '1.0001', 'infinity']) {
    await assert.rejects(invoke('potato', { unit: 'kg', quantity }), { status: 400 });
  }
});

test('fixed metric units convert exactly and totals beyond safe cents are rejected', async () => {
  references = new Map([['potato', {
    commodity: { id: 'potato', label: 'Potato' },
    reference: {
      price: 0.2,
      unit: 'g',
      source: 'verified_local_market',
      year: 2026,
    },
  }]]);
  const converted = await invoke('potato', { unit: 'kg', quantity: '2' });
  assert.equal(converted.body.recommendedUnitPrice, 200);
  assert.equal(converted.body.estimatedTotal, 400);

  references = new Map([['potato', {
    commodity: { id: 'potato', label: 'Potato' },
    reference: { price: 999999, unit: 'kg', source: 'admin_entered', year: 2026 },
  }]]);
  await assert.rejects(
    invoke('potato', { unit: 'kg', quantity: '1000000000' }),
    { status: 400 },
  );
});

test('admin can register a custom reference unit and it is saved with the price', async () => {
  insertedUnits.length = 0;
  savedOverrideArgs = null;
  const res = {
    json(value) { this.body = value; },
  };
  await setOverride({
    params: { commodityId: 'tobacco' },
    body: {
      referencePrice: 42,
      referenceYear: 2026,
      unit: 'basket',
      customUnit: true,
      source: 'admin_entered',
      effectiveDate: '2026-11-10',
      reason: 'Local market survey',
    },
    profile: { id: 'admin-1', name: 'Admin' },
  }, res);

  assert.equal(insertedUnits.length, 1);
  assert.equal(insertedUnits[0].table, 'units');
  assert.equal(insertedUnits[0].name, 'basket');
  assert.equal(savedOverrideArgs.p_unit, 'basket');
  assert.equal(res.body.unit, 'basket');
});
