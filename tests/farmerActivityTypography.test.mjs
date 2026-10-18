import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Farmer buyer-activity table uses readable native typography and compact unclipped statuses', async () => {
  const css = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  const scoped = css.slice(css.indexOf('.farmer-activity-table table {'));
  assert.match(scoped, /font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif/);
  assert.match(scoped, /\.farmer-activity-table \.badge\.badge-status \{[^}]*padding: 4px 7px;[^}]*font-size: 12px;[^}]*font-weight: 500;[^}]*text-transform: capitalize/);
  assert.match(scoped, /\.farmer-activity-table \.table-cell-value \{[^}]*overflow: visible;[^}]*white-space: normal/);
  const source = await readFile(new URL('../src/features/farmer/FarmerDashboard.jsx', import.meta.url), 'utf8');
  const table = source.slice(source.indexOf('className="farmer-activity-table"'), source.indexOf('rows={orders.slice(0, 5)}') + 28);
  assert.doesNotMatch(table, /truncate: true/);
  assert.match(table, /<StatusBadge value=\{row.status\}/);
  assert.match(table, /<PaymentMethodLabel method=\{row.paymentMethod\}/);
});
