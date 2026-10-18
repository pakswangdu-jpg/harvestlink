import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Recent listings preserve real products, prices, quantities, statuses and management route', async () => {
  const source = await readFile(new URL('../src/features/farmer/FarmerDashboard.jsx', import.meta.url), 'utf8');
  const start = source.indexOf('className="farmer-recent-listings-table"');
  const table = source.slice(start, source.indexOf('emptyMessage="No products yet."', start));
  assert.match(table, /responsiveLabels/);
  assert.match(table, /rows=\{products.slice\(0, 5\)\}/);
  assert.match(table, /formatCurrency\(row.price\)/);
  assert.match(table, /\$\{row.quantity\} \$\{row.unit\}/);
  assert.match(table, /<StatusBadge value=\{row.status\}/);
  assert.match(source, /to="\/farmer-products">Manage products/);
});

test('Recent listings use compact typography and mobile records without styling other tables', async () => {
  const css = await readFile(new URL('../src/features/farmer/FarmerRecentListings.css', import.meta.url), 'utf8');
  for (const match of css.matchAll(/([^{}]+)\{/g)) {
    if (!match[1].trim().startsWith('@')) assert.ok(match[1].includes('.farmer-recent-listings'));
  }
  assert.match(css, /font-variant-numeric: tabular-nums/);
  assert.match(css, /\.badge\.badge-status \{[^}]*font-size: 12px;[^}]*font-weight: 500/);
  assert.match(css, /@container \(max-width: 420px\)/);
  assert.match(css, /content: attr\(data-label\)/);
});
