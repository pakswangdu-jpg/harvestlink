import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Nearby UI retains the map inputs, real distances and marketplace destinations', async () => {
  const source = await readFile(new URL('../src/features/buyer/BuyerDashboard.jsx', import.meta.url), 'utf8');
  const map = source.slice(source.indexOf('<DeliveryMap'), source.indexOf('/>', source.indexOf('<DeliveryMap')) + 2);
  for (const input of ['farmers={nearbyFarmers}', 'buyers={nearbyBuyers}', 'stakeholders={nearbyStakeholders}', 'nearbyView', 'viewerCoords={nearbyOrigin}', "viewerAddress={currentUser.address || currentUser.municipality || ''}"]) {
    assert.ok(map.includes(input), input);
  }
  assert.match(source, /formatNearbyDistance\(distanceKm\)/);
  assert.match(source, /sortByRegisteredDistance\(nearbyOrigin, verifiedFarmers\)/);
  assert.match(source, /to=\{farmerMarketplacePath\(farmer\)\}/);
});

test('Nearby styles target surrounding UI only, with compact rows and responsive outer layout', async () => {
  const css = await readFile(new URL('../src/features/buyer/BuyerNearbyFarmers.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /delivery-map|gm-style|fullscreen|linear-gradient|box-shadow/);
  assert.match(css, /grid-template-columns: minmax\(0, 1\.8fr\) minmax\(320px, 1fr\)/);
  assert.match(css, /padding: 15px 16px/);
  assert.match(css, /\.nearby-farmers-list li \{[^}]*border-bottom: 1px solid var\(--line\)/);
  assert.match(css, /\.nearby-distance-badge\.is-unavailable \{[^}]*color: var\(--muted\)/);
  assert.match(css, /@container \(max-width: 950px\)/);
});
