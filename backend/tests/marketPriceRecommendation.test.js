import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

let references = new Map();
let savedOverrideArgs;
const overrideStore = new Map();
const overrideHistory = [];
const insertedUnits = [];
const supabaseAdmin = {
  from(table) {
    if (table === 'market_price_override_history') {
      const filters = [];
      return {
        select() { return this; },
        eq(col, val) { filters.push([col, val]); return this; },
        order() {
          const filtered = overrideHistory.filter((row) => filters.every(([c, v]) => row[c] === v));
          return Promise.resolve({ data: [...filtered].reverse(), error: null });
        },
      };
    }
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
  rpc: async (name, args) => {
    if (name === 'clear_market_price_override') {
      const key = `${args.p_commodity_id}::${args.p_market_type}`;
      const prev = overrideStore.get(key);
      if (prev) {
        overrideStore.set(key, { ...prev, is_active: false });
        overrideHistory.push({
          id: `hist-${overrideHistory.length + 1}`,
          commodity_id: prev.commodity_id,
          commodity_label: prev.commodity_label,
          market_type: args.p_market_type,
          previous_price: prev.reference_price,
          new_price: null,
          reason: `Deactivated ${args.p_market_type} reference price.`,
          updated_by: args.p_updated_by,
          updated_by_name: args.p_updated_by_name,
          created_at: new Date().toISOString(),
        });
      }
      return { data: null, error: null };
    }
    savedOverrideArgs = args;
    const key = `${args.p_commodity_id}::${args.p_market_type}`;
    const prev = overrideStore.get(key);
    const saved = {
      id: `ovr-${key}`,
      commodity_id: args.p_commodity_id,
      commodity_label: args.p_commodity_label,
      market_type: args.p_market_type,
      reference_price: args.p_reference_price,
      reference_year: args.p_reference_year,
      unit: args.p_unit,
      source: args.p_source,
      effective_date: args.p_effective_date,
      supporting_reference: args.p_supporting_reference,
      reason: args.p_reason,
      is_active: true,
    };
    overrideStore.set(key, saved);
    overrideHistory.push({
      id: `hist-${overrideHistory.length + 1}`,
      commodity_id: args.p_commodity_id,
      commodity_label: args.p_commodity_label,
      market_type: args.p_market_type,
      previous_price: prev?.reference_price ?? null,
      new_price: args.p_reference_price,
      previous_unit: prev?.unit ?? null,
      new_unit: args.p_unit,
      previous_source: prev?.source ?? null,
      new_source: args.p_source,
      effective_date: args.p_effective_date,
      supporting_reference: args.p_supporting_reference,
      reason: args.p_reason,
      updated_by: args.p_updated_by,
      updated_by_name: args.p_updated_by_name,
      created_at: new Date().toISOString(),
    });
    return { data: [saved], error: null };
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
    resolveEffectiveReference: async (id, { marketType = 'retail' } = {}) => {
      const keyed = references.get(`${id}::${marketType}`);
      if (keyed) return keyed;
      if (marketType === 'wholesale') {
        const base = references.get(id);
        return { commodity: base?.commodity || { id, label: id }, reference: null };
      }
      return references.get(id) || { commodity: { id, label: id }, reference: null };
    },
  },
});
const {
  clearOverride, getOverrideHistory, getRecommendation, setOverride,
} = await import('../src/controllers/marketPriceOverrides.controller.js');
const { calculateWholesalePricing, calculateEstimatedTotal } = await import('../shared/pricing.js');

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
  assert.deepEqual(response.body.priceRange, { minimumPrice: 66.5, maximumPrice: 73.5, percent: 5 });
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('PSA references do not receive the admin-reference price band', async () => {
  references = new Map([['potato', {
    commodity: { id: 'potato', label: 'Potato' },
    reference: { price: 70, unit: 'kg', source: 'psa', year: 2026 },
  }]]);
  const response = await invoke('potato', { unit: 'kg', quantity: '1' });
  assert.deepEqual(response.body.priceRange, { minimumPrice: 66.5, maximumPrice: 73.5, percent: 5 });
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
  assert.deepEqual(exact.body.priceRange, { minimumPrice: 119.23, maximumPrice: 131.78, percent: 5 });

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
      marketType: 'retail',
      referencePrice: 42,
      referenceYear: 2026,
      unit: 'basket',
      customUnit: true,
      source: 'admin_entered',
      effectiveDate: '2026-11-10',
      supportingReference: 'Carbon Public Market, Cebu City — Nov 10 survey',
      reason: 'Local market survey',
    },
    profile: { id: 'admin-1', name: 'Admin' },
  }, res);

  assert.equal(insertedUnits.length, 1);
  assert.equal(insertedUnits[0].table, 'units');
  assert.equal(insertedUnits[0].name, 'basket');
  assert.equal(savedOverrideArgs.p_unit, 'basket');
  assert.equal(savedOverrideArgs.p_market_type, 'retail');
  assert.equal(res.body.unit, 'basket');
  assert.equal(res.body.marketType, 'retail');
});

test('same commodity maintains independent Retail and Wholesale reference prices and histories', async () => {
  overrideStore.clear();
  overrideHistory.length = 0;

  const makeRes = () => ({ statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; }, end() {} });

  // Validation: missing marketType or missing supportingReference is rejected
  await assert.rejects(setOverride({
    params: { commodityId: 'cabbage' },
    body: {
      referencePrice: 150, referenceYear: 2026, unit: 'kg', source: 'admin_entered',
      effectiveDate: '2026-11-27', supportingReference: 'Carbon Market Cebu City', reason: 'Survey',
    },
    profile: { id: 'admin-1', name: 'Admin' },
  }, makeRes()), { status: 400 });

  await assert.rejects(setOverride({
    params: { commodityId: 'cabbage' },
    body: {
      marketType: 'retail', referencePrice: 150, referenceYear: 2026, unit: 'kg', source: 'admin_entered',
      effectiveDate: '2026-11-27', supportingReference: '', reason: 'Survey',
    },
    profile: { id: 'admin-1', name: 'Admin' },
  }, makeRes()), { status: 400 });

  // Save Retail reference (PHP 150/kg)
  const retailRes = makeRes();
  await setOverride({
    params: { commodityId: 'cabbage' },
    body: {
      marketType: 'retail', referencePrice: 150, referenceYear: 2026, unit: 'kg', source: 'verified_local_market',
      effectiveDate: '2026-11-27', supportingReference: 'Carbon Public Market, Cebu City (Nov 27)', reason: 'Retail survey',
    },
    profile: { id: 'admin-1', name: 'Admin' },
  }, retailRes);
  assert.equal(retailRes.body.marketType, 'retail');
  assert.equal(retailRes.body.referencePrice, 150);

  // Save Wholesale reference (PHP 40/kg) — must not overwrite Retail
  const wholesaleRes = makeRes();
  await setOverride({
    params: { commodityId: 'cabbage' },
    body: {
      marketType: 'wholesale', referencePrice: 40, referenceYear: 2026, unit: 'kg', source: 'verified_local_market',
      effectiveDate: '2026-11-27', supportingReference: 'Mantalongon Trading Post, Dalaguete (Nov 27)', reason: 'Wholesale trading post survey',
    },
    profile: { id: 'admin-1', name: 'Admin' },
  }, wholesaleRes);
  assert.equal(wholesaleRes.body.marketType, 'wholesale');
  assert.equal(wholesaleRes.body.referencePrice, 40);
  assert.equal(overrideStore.get('cabbage::retail').reference_price, 150);
  assert.equal(overrideStore.get('cabbage::wholesale').reference_price, 40);

  // Independent history filtering
  const retailHistoryRes = makeRes();
  await getOverrideHistory({ params: { commodityId: 'cabbage' }, query: { marketType: 'retail' } }, retailHistoryRes);
  assert.equal(retailHistoryRes.body.length, 1);
  assert.equal(retailHistoryRes.body[0].marketType, 'retail');

  const wholesaleHistoryRes = makeRes();
  await getOverrideHistory({ params: { commodityId: 'cabbage' }, query: { marketType: 'wholesale' } }, wholesaleHistoryRes);
  assert.equal(wholesaleHistoryRes.body.length, 1);
  assert.equal(wholesaleHistoryRes.body[0].marketType, 'wholesale');

  // Deactivating wholesale leaves retail active
  const clearRes = makeRes();
  await clearOverride({ params: { commodityId: 'cabbage' }, query: { marketType: 'wholesale' }, profile: { id: 'admin-1', name: 'Admin' } }, clearRes);
  assert.equal(clearRes.statusCode, 204);
  assert.equal(overrideStore.get('cabbage::wholesale').is_active, false);
  assert.equal(overrideStore.get('cabbage::retail').is_active, true);
});

test('farmer recommendation uses independent Retail and Wholesale admin references and validates break-even', async () => {
  references = new Map([
    ['cabbage::retail', {
      commodity: { id: 'cabbage', label: 'Cabbage' },
      reference: { price: 150, unit: 'kg', marketType: 'retail', source: 'verified_local_market', effectiveDate: '2026-11-27', year: 2026 },
    }],
    ['cabbage::wholesale', {
      commodity: { id: 'cabbage', label: 'Cabbage' },
      reference: { price: 40, unit: 'kg', marketType: 'wholesale', source: 'verified_local_market', effectiveDate: '2026-11-27', year: 2026 },
    }],
  ]);

  const retail = await invoke('cabbage', { unit: 'kg', quantity: '100', costPrice: '30', sellingType: 'retail' });
  assert.equal(retail.body.referencePrice, 150);
  assert.equal(retail.body.recommendedUnitPrice, 150);
  assert.equal(retail.body.salesType, 'retail');

  const wholesale = await invoke('cabbage', {
    unit: 'kg', quantity: '100', costPrice: '30', sellingType: 'wholesale',
    moq: '50', handlingCostPerOrder: '250', targetProfitMargin: '20',
  });
  assert.equal(wholesale.body.salesType, 'wholesale');
  assert.equal(wholesale.body.pricingBasis, 'wholesale_reference');
  assert.equal(wholesale.body.referencePrice, 40);
  assert.equal(wholesale.body.recommendedUnitPrice, 40);
  assert.equal(wholesale.body.handlingCostPerUnit, 5);
  assert.equal(wholesale.body.totalCostPerUnit, 35);
  assert.equal(wholesale.body.minimumOrderTotal, 2000);
  assert.equal(wholesale.body.totalExpenses, 1750);
  assert.equal(wholesale.body.estimatedGrossProfit, 250);
  assert.equal(wholesale.body.isBelowBreakEven, false);
});

test('wholesale cost-based pricing matches expected formula example and differs from retail', async () => {
  references = new Map([['tomato', {
    commodity: { id: 'tomato', label: 'Tomato' },
    reference: {
      price: 150,
      unit: 'kg',
      source: 'admin_entered',
      effectiveDate: '2026-11-10',
      year: 2026,
    },
  }]]);

  const retail = await invoke('tomato', {
    unit: 'kg',
    quantity: '100',
    costPrice: '100',
    sellingType: 'retail',
  });
  assert.equal(retail.body.salesType, 'retail');
  assert.equal(retail.body.referencePrice, 150);
  assert.equal(retail.body.recommendedUnitPrice, 150);
  assert.equal(retail.body.estimatedTotal, 15000);
  assert.equal(retail.body.estimatedProfit, 50);
  assert.equal(retail.body.profitMargin, 33.33);
  assert.equal(retail.body.isBelowBreakEven, false);

  const wholesale = await invoke('tomato', {
    unit: 'kg',
    quantity: '100',
    costPrice: '100',
    sellingType: 'wholesale',
    moq: '50',
    handlingCostPerOrder: '250',
    targetProfitMargin: '20',
  });
  assert.equal(wholesale.body.salesType, 'wholesale');
  // No wholesale reference exists, so retail reference is never substituted; cost-based estimate is used.
  assert.equal(wholesale.body.referencePrice, null);
  assert.equal(wholesale.body.retailRecommendedPrice, 150);
  assert.equal(wholesale.body.pricingBasis, 'cost_based_wholesale');
  assert.equal(wholesale.body.wholesaleMarketDataAvailable, false);
  assert.equal(wholesale.body.insufficientMarketData, true);
  assert.equal(wholesale.body.handlingCostPerUnit, 5);
  assert.equal(wholesale.body.totalCostPerUnit, 105);
  assert.equal(wholesale.body.breakEvenCost, 105);
  assert.equal(wholesale.body.recommendedUnitPrice, 131.25);
  assert.equal(wholesale.body.minimumOrderTotal, 6562.5);
  assert.equal(wholesale.body.totalExpenses, 5250);
  assert.equal(wholesale.body.estimatedGrossProfit, 1312.5);
  assert.equal(wholesale.body.estimatedStockValue, 13125);
  assert.equal(wholesale.body.estimatedTotal, 13125);
  assert.ok(wholesale.body.formulaLines.some((line) => line.includes('₱131.25')));
  assert.ok(wholesale.body.wholesaleVsRetailExplanation.includes('₱18.75/kg lower than Retail'));
});

test('missing production cost is never treated as zero and retail price is never substituted for wholesale', async () => {
  references = new Map([['tomato', {
    commodity: { id: 'tomato', label: 'Tomato' },
    reference: {
      price: 150,
      unit: 'kg',
      source: 'admin_entered',
      effectiveDate: '2026-11-10',
      year: 2026,
    },
  }]]);

  const wholesaleNoCost = await invoke('tomato', {
    unit: 'kg',
    quantity: '100',
    costPrice: '',
    sellingType: 'wholesale',
    moq: '50',
    handlingCostPerOrder: '250',
    targetProfitMargin: '20',
  });
  assert.equal(wholesaleNoCost.body.available, false);
  assert.equal(wholesaleNoCost.body.reason, 'no_wholesale_reference');
  assert.equal(wholesaleNoCost.body.costPrice, null);
  assert.equal(wholesaleNoCost.body.totalCostPerUnit, null);
  assert.equal(wholesaleNoCost.body.recommendedUnitPrice, null);
  assert.equal(wholesaleNoCost.body.estimatedTotal, null);
});

test('MOQ exceeding available stock is flagged and break-even warnings trigger accurately', async () => {
  references = new Map([['tomato', {
    commodity: { id: 'tomato', label: 'Tomato' },
    reference: {
      price: 90,
      unit: 'kg',
      source: 'admin_entered',
      effectiveDate: '2026-11-10',
      year: 2026,
    },
  }]]);

  const moqTooHigh = await invoke('tomato', {
    unit: 'kg',
    quantity: '100',
    costPrice: '100',
    sellingType: 'wholesale',
    moq: '120',
    handlingCostPerOrder: '250',
    targetProfitMargin: '20',
  });
  assert.equal(moqTooHigh.body.moqExceedsStock, true);
  assert.equal(moqTooHigh.body.handlingCostPerUnit, null);
  assert.equal(moqTooHigh.body.minimumOrderTotal, null);

  const retailBelowCost = await invoke('tomato', {
    unit: 'kg',
    quantity: '50',
    costPrice: '100',
    sellingType: 'retail',
    sellingPrice: '95',
  });
  assert.equal(retailBelowCost.body.recommendedUnitPrice, 90);
  assert.equal(retailBelowCost.body.isBelowBreakEven, true);
  assert.equal(retailBelowCost.body.isEnteredPriceBelowBreakEven, true);

  const wholesaleBelowBreakEven = await invoke('tomato', {
    unit: 'kg',
    quantity: '100',
    costPrice: '100',
    sellingType: 'wholesale',
    moq: '50',
    handlingCostPerOrder: '250',
    targetProfitMargin: '20',
    sellingPrice: '102',
  });
  assert.equal(wholesaleBelowBreakEven.body.breakEvenCost, 105);
  assert.equal(wholesaleBelowBreakEven.body.isEnteredPriceBelowBreakEven, true);
  assert.equal(wholesaleBelowBreakEven.body.isBelowBreakEven, false);
});

test('shared pricing helper supports actual wholesale market data and valid/empty quantity totals', () => {
  const withMarketData = calculateWholesalePricing({
    productionCost: 100,
    handlingCostPerOrder: 250,
    moq: 50,
    availableQuantity: 100,
    targetProfitMargin: 20,
    adminReferencePrice: 150,
    wholesaleMarketPrice: 128,
    unit: 'kg',
  });
  assert.equal(withMarketData.pricingBasis, 'wholesale_market_data');
  assert.equal(withMarketData.wholesaleMarketDataAvailable, true);
  assert.equal(withMarketData.recommendedPrice, 128);
  assert.equal(withMarketData.minimumOrderTotal, 6400);
  assert.equal(withMarketData.totalExpenses, 5250);
  assert.equal(withMarketData.estimatedGrossProfit, 1150);
  assert.equal(withMarketData.estimatedStockValue, 12800);

  assert.equal(calculateEstimatedTotal(131.25, 100), 13125);
  assert.equal(calculateEstimatedTotal(131.25, 0), null);
  assert.equal(calculateEstimatedTotal(131.25, ''), null);
});
