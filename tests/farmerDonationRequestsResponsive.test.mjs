import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Donation response table keeps records and management route with responsive labels', async () => {
  const source = await readFile(new URL('../src/features/farmer/FarmerDashboard.jsx', import.meta.url), 'utf8');
  assert.match(source, /className="farmer-dashboard-donation-table"\s*responsiveLabels/);
  assert.match(source, /rows=\{pendingDonationRequests\}/);
  assert.match(source, /to="\/farmer-donations"/);
  assert.match(source, /key: 'requestedByName', label: 'Requested by', width: '38%'/);
});

test('Donation table wraps long names and becomes content-sized records in narrow panels', async () => {
  const css = await readFile(new URL('../src/features/farmer/FarmerDonationRequests.css', import.meta.url), 'utf8');
  assert.match(css, /table-layout: fixed/);
  assert.match(css, /white-space: normal; overflow-wrap: anywhere/);
  assert.match(css, /@container \(max-width: 560px\)/);
  assert.match(css, /content: attr\(data-label\)/);
  assert.match(css, /tr \{[^}]*height: auto; min-height: 0/);
});
