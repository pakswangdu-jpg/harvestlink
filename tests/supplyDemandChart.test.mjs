import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';

const source = (await readFile(new URL('../src/components/charts/SupplyDemandBarChart.jsx', import.meta.url), 'utf8'))
  .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
  .replace(/import\s+['"][^'"]+['"];?/g, '').replace('export default ', '');
const { code } = await transformWithOxc(source, 'SupplyDemandBarChart.jsx', { jsx: { runtime: 'classic' } });
let width = 280;
const scope = {
  React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
  useMemo: (fn) => fn(), useState: () => [width, () => {}],
  ...Object.fromEntries(['Bar', 'BarChart', 'CartesianGrid', 'LabelList', 'ResponsiveContainer', 'Tooltip', 'XAxis', 'YAxis', 'Bot', 'LineChart', 'Sprout'].map((name) => [name, name])),
};
const Chart = new Function('scope', `with(scope){${code};return SupplyDemandBarChart;}`)(scope);
const nodes = (node) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(nodes)];
const data = [{ crop: 'Cabbage', demand: 74, supply: 5 }, { crop: 'Dragon Fruit', demand: 8, supply: 1 }];

test('narrow chart uses horizontal bars without changing data or series', () => {
  width = 280;
  const before = structuredClone(data);
  const all = nodes(Chart({ data }));
  const chart = all.find((node) => node.type === 'BarChart');
  assert.equal(chart.props.layout, 'vertical');
  assert.equal(chart.props.data, data);
  assert.equal(all.find((node) => node.type === 'YAxis').props.dataKey, 'crop');
  assert.deepEqual(all.filter((node) => node.type === 'Bar').map((node) => node.props.dataKey), ['demand', 'supply']);
  assert.ok(all.filter((node) => node.type === 'LabelList').every((node) => node.props.position === 'right'));
  assert.deepEqual(data, before);
});

test('wide chart retains vertical bars and crop labels below the axis', () => {
  width = 1000;
  const all = nodes(Chart({ data }));
  assert.equal(all.find((node) => node.type === 'BarChart').props.layout, 'horizontal');
  assert.equal(all.find((node) => node.type === 'XAxis').props.dataKey, 'crop');
});

test('empty chart keeps its existing empty state', () => {
  assert.equal(nodes(Chart({ data: [] })).some((node) => node.type === 'BarChart'), false);
});
