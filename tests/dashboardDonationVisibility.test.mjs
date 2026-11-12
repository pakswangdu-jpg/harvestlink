import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('only stakeholder maps show donation alerts', async () => {
  const [farmer, buyer, stakeholder, map] = await Promise.all([
    read('../src/features/farmer/FarmerDashboard.jsx'),
    read('../src/features/buyer/BuyerDashboard.jsx'),
    read('../src/features/stakeholder/StakeholderDashboard.jsx'),
    read('../src/components/orders/DeliveryMap.jsx'),
  ]);

  assert.match(farmer, /getNearbyMapProfiles\(\)/);
  assert.match(farmer, /farmerMarkersGreen/);
  assert.doesNotMatch(farmer, /showDonationAlerts|legend-dot donation/);
  assert.match(buyer, /showDonationAlerts=\{false\}/);
  assert.doesNotMatch(buyer, /legend-dot donation/);
  assert.match(stakeholder, /getAvailableDonations\(\)/);
  assert.match(stakeholder, /donationFarmers=\{mapFarmers\}/);
  assert.match(map, /showDonationAlerts = false/);
  assert.match(map, /showDonationAlerts && isDonationAlert\(farmer, coords\)/);
});
