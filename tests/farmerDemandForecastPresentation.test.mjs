import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const element = (type, props, ...children) => ({ type, props: { ...props, children } });

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  const children = tree.props?.children || [];
  return [tree, ...(Array.isArray(children) ? children : [children]).flatMap(nodes)];
}

async function getForecastTable(sortBy) {
  const file = new URL('../src/components/forecast/ForecastTable.jsx', import.meta.url);
  const original = await readFile(file, 'utf8');
  const source = original
    .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
    .replace('export default ', '');
  const { code } = await transformWithOxc(source, 'ForecastTable.jsx', { jsx: { runtime: 'classic' } });
  let stateIndex = 0;
  const scope = {
    React: { createElement: element, Fragment: 'fragment' },
    useMemo: (callback) => callback(),
    useState: (initial) => [stateIndex++ === 0 ? '' : sortBy || initial, () => {}],
    Search: 'Search',
    TrendIndicator: 'TrendIndicator',
    cropActionRecommendation: () => 'Sell',
    formatCurrency: (value) => `PHP ${value}`,
  };
  const ForecastTable = new Function('scope', `with (scope) { ${code}; return ForecastTable; }`)(scope);
  return ForecastTable;
}

const crops = [
  { crop: 'Cabbage', expectedChangePercent: 4, quantityOrdered: 10 },
  { crop: 'Eggplant', expectedChangePercent: -2, quantityOrdered: 50 },
  { crop: 'Tomato', expectedChangePercent: null, quantityOrdered: 20 },
];

function getMobileCropOrder(tree) {
  return nodes(tree)
    .filter((node) => node.type?.name === 'CropCard')
    .map((node) => node.props.entry.crop);
}

function renderTable(ForecastTable) {
  return ForecastTable({
    crops,
    selectedCrop: 'Cabbage',
    onSelectCrop() {},
    category: '',
    onCategoryChange() {},
    categoryOptions: [],
    demandLevel: '',
    onDemandLevelChange() {},
  });
}

test('forecast crop list sorts by expected price change and buyer demand', async () => {
  const ForecastTable = await getForecastTable();
  assert.deepEqual(getMobileCropOrder(renderTable(ForecastTable)), ['Cabbage', 'Eggplant', 'Tomato']);

  const ForecastTableByDemand = await getForecastTable('demand_desc');
  assert.deepEqual(getMobileCropOrder(renderTable(ForecastTableByDemand)), ['Eggplant', 'Tomato', 'Cabbage']);
});

test('forecast labels distinguish price differences from profit and avoid invented weather advice', async () => {
  const [table, summary, weather, report, page, activityChart] = await Promise.all([
    readFile(new URL('../src/components/forecast/ForecastTable.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/forecast/ForecastKpiGrid.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/forecast/WeatherPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/forecast/MarketAnalysisReport.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/farmer/FarmerDemandForecast.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/charts/SupplyDemandBarChart.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(table, /Highest expected price increase/);
  assert.match(table, /md:hidden/);
  assert.doesNotMatch(table, /profit/i);
  assert.match(table, /Good selling opportunity/);
  assert.match(table, /Highest demand/);
  assert.match(table, /fontSize: '15px'/);
  assert.match(table, /background: 'transparent'/);
  assert.match(table, /text-\[15px\] font-semibold text-\[var\(--text\)\]/);
  assert.match(summary, /Forecast confidence/);
  assert.doesNotMatch(summary, /AI Confidence|Average forecast price/);
  assert.match(weather, /Weather information is not available/);
  assert.doesNotMatch(weather, /Favorable conditions for harvesting/);
  assert.match(report, /price difference estimate, not profit/);
  assert.match(report, /Why this recommendation\?/);
  assert.match(page, /About this forecast/);
  assert.match(page, /Last updated:/);
  assert.match(page, /Best opportunity/);
  assert.match(page, /Data sources:/);
  assert.match(table, /Prices are per listed unit/);
  assert.match(activityChart, /layout="vertical"/);
  assert.match(page, /grid min-w-0 grid-cols-1 items-stretch gap-4 xl:grid-cols-2/);
});
