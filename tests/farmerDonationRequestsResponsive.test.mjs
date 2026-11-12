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

test('Farmer donation offers show remaining stock while claims are pending and refresh automatically', async () => {
  const page = await readFile(new URL('../src/features/farmer/FarmerDonations.jsx', import.meta.url), 'utf8');
  const hook = await readFile(new URL('../src/hooks/useDonationList.js', import.meta.url), 'utf8');
  assert.match(page, /donation\.status === 'available'[\s\S]*?Number\(donation\.availableQuantity \?\? donation\.quantity\) > 0/);
  assert.match(page, /formatQuantity\(donation\.availableQuantity \?\? donation\.quantity\)/);
  assert.match(hook, /setInterval\(\(\) => \{ if \(!pending\.current\) reload\(\); \}, 4000\)/);
});

test('Completed donation history shows the exact handover date and time in Manila', async () => {
  const page = await readFile(new URL('../src/features/farmer/FarmerDonations.jsx', import.meta.url), 'utf8');
  assert.match(page, /formatDateTimeManila\(row\.confirmedAt \|\| row\.updatedAt\)/);
  assert.match(page, /row\.status === 'completed' && \(row\.confirmedAt \|\| row\.updatedAt\)/);
});

test('Donation history omits the unused Actions column and keeps its Status column', async () => {
  const page = await readFile(new URL('../src/features/farmer/FarmerDonations.jsx', import.meta.url), 'utf8');
  assert.match(page, /key: 'status', label: 'Status'/);
  assert.doesNotMatch(page, /key: 'actions', label: 'Actions'/);
});

test('Donation offer uses a transparent marker with subtle reduced-motion-aware animation', async () => {
  const page = await readFile(new URL('../src/features/farmer/FarmerDonations.jsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  assert.match(page, /import donateMapPin from '\.\.\/\.\.\/assets\/icons\/donate-map-pin\.png'/);
  assert.match(page, /className="farmer-donation-marker"[\s\S]*?src=\{donateMapPin\}/);
  assert.match(styles, /\.farmer-donation-marker \{[\s\S]*?width: 64px;[\s\S]*?animation: farmer-donation-marker-float 4s ease-in-out infinite/);
  assert.match(styles, /prefers-reduced-motion: reduce\) \{\s*\.farmer-donation-marker \{\s*animation: none;/);
});
