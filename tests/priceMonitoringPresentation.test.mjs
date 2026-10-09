import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

async function compile(file, name, scope = {}) {
  const original = await readFile(new URL(`../src/features/admin/priceMonitoring/${file}`, import.meta.url), 'utf8');
  const source = original.replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '').replaceAll('export default ', '').replaceAll('export function ', 'function ');
  const { code } = await transformWithOxc(source, file, { jsx: { runtime: 'classic' } });
  return new Function('scope', `with(scope){${code};return ${name};}`)(scope);
}

const element = (type, props, ...children) => ({ type, props: { ...props, children } });
const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.props?.children || []).flat(Infinity).flatMap(nodes)];

test('price differences are display-only and unavailable data does not become zero', async () => {
  const difference = await compile('pricePresentation.js', 'priceDifference', { formatCurrency: (value) => `PHP ${value.toFixed(2)}` });
  assert.equal(difference(47.6, 37.59).label, '+PHP 10.01 / +26.6%');
  assert.equal(difference(30, 40).label, '-PHP 10.00 / -25.0%');
  for (const [price, reference] of [[null,40], [40,null], [40,0], [NaN,40]]) assert.equal(difference(price,reference), null);
});

test('listing comparison requires an explicit comparable unit and a loaded reference', async () => {
  const compare = await compile('pricePresentation.js', 'listingComparison', { getFixedKgPerUnit: (unit) => ({ kg: 1, g: 0.001 })[unit] ?? null, formatCurrency: String });
  assert.equal(compare({ price: 50, unit: 'kg' }, { referencePrice: 40 }).percent, 25);
  assert.equal(compare({ price: 100, unit: 'sack', kgPerUnit: 2 }, { referencePrice: 40 }).percent, 25);
  assert.equal(compare({ price: 100, unit: 'piece' }, { referencePrice: 40 }), null);
  assert.equal(compare({ price: 50, unit: 'kg' }, { referencePrice: 40, loading: true }), null);
});

test('commodity rows do not render edit fields or permanent reset controls', async () => {
  const scope = { React: { createElement: element }, Fragment: 'fragment', useSyncExternalStore: () => false, ChevronDown: 'icon', ChevronRight: 'icon', Badge: 'badge', CommodityDetailPanel: 'details', formatCurrency: String, priceDifference: () => null, STATUS_META: { normal: { tone: 'success', label: 'Normal' } } };
  const Table = await compile('CommodityTable.jsx', 'CommodityTable', scope);
  const row = { id: '28', label: 'Cabbage', category: 'Vegetables', psaPrice: 40, psaYear: 2025, avgFarmerPrice: 50, referencePrice: 40, listingsCount: 1, status: 'normal', loading: false };
  const all = nodes(Table({ rows: [row], selectedIds: new Set(), onToggleSelect() {}, expandedId: null }));
  assert.ok(all.filter((node) => node.type === 'input').every((node) => node.props.type === 'checkbox'));
  assert.ok(!all.some((node) => node.type === 'details'));
  const actions = all.filter((node) => node.props.className === 'pm-link');
  assert.ok(actions.some((node) => node.props.children.includes('Set price')));
});

test('PSA display stays distinct from the effective Admin reference and existing averages', async () => {
  const values = [];
  let index = 0;
  const effects = [];
  let mounted = false;
  const product = { id: 'p1', name: 'Cabbage', status: 'active', unit: 'kg', price: 50 };
  const scope = {
    MARKET_COMMODITIES: [{ id: '28', label: 'Cabbage' }],
    useState(initial) { const slot = index++; if (!(slot in values)) values[slot] = initial; return [values[slot], (next) => { values[slot] = typeof next === 'function' ? next(values[slot]) : next; }]; },
    useCallback: (callback) => callback,
    useMemo: (callback) => callback(),
    useEffect: (callback) => { if (!mounted) effects.push(callback); },
    fetchAnnualPriceTrend: async () => [{ year: 2025, price: 40, isOverride: true }],
    fetchRawAnnualPriceTrend: async () => [{ year: 2025, price: 37.59 }],
    getPriceOverride: async () => ({ referencePrice: 40, referenceYear: 2025 }),
    getProducts: async () => [product], getPendingPriceReviews: async () => [],
    getFixedKgPerUnit: () => 1, matchCommodity: () => ({ id: '28' }), getCommodityCategory: () => 'Vegetables',
    resolveCommodityStatus: ({ hasOverride }) => hasOverride ? 'overridden' : 'normal', setTimeout: (callback) => callback(),
  };
  const hook = await compile('useCommodityMonitoring.js', 'useCommodityMonitoring', scope);
  hook(); effects.forEach((effect) => effect()); mounted = true;
  await new Promise((resolve) => setImmediate(resolve));
  index = 0;
  const row = hook().rows[0];
  assert.equal(row.referencePrice, 40);
  assert.equal(row.psaPrice, 37.59);
  assert.equal(row.psaYear, 2025);
  assert.equal(row.avgFarmerPrice, 50);
  assert.equal(row.status, 'overridden');
  assert.deepEqual(row.relatedListings, [product]);
});
