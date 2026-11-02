import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('all dashboard maps use consistent role colors while donation markers stay distinct', async () => {
  const [colors, farmerMap, deliveryMap, styles, farmerDashboard, buyerDashboard, stakeholderDashboard] = await Promise.all([
    read('../src/lib/mapMarkerColors.js'),
    read('../src/components/map/FarmerMap.jsx'),
    read('../src/components/orders/DeliveryMap.jsx'),
    read('../src/styles/globals.css'),
    read('../src/features/farmer/FarmerDashboard.jsx'),
    read('../src/features/buyer/BuyerDashboard.jsx'),
    read('../src/features/stakeholder/StakeholderDashboard.jsx'),
  ]);

  assert.match(colors, /farmer: '#15803d'/);
  assert.match(colors, /buyer: '#2563eb'/);
  assert.match(colors, /stakeholder: '#db2777'/);
  for (const mapSource of [farmerMap, deliveryMap]) {
    for (const role of ['farmer', 'buyer', 'stakeholder']) {
      assert.match(mapSource, new RegExp(`MAP_COLORS\\.${role}`));
    }
  }
  assert.match(styles, /\.legend-dot\.farmer\s*\{\s*background: #15803d;/);
  assert.match(styles, /\.legend-dot\.buyer\s*\{\s*background: #2563eb;/);
  assert.match(styles, /\.legend-dot\.stakeholder\s*\{\s*background: #db2777;/);
  assert.match(styles, /\.legend-dot\.donation\s*\{\s*background: #d94b43;/);
  assert.match(farmerDashboard, /legend-dot donation/);
  assert.doesNotMatch(buyerDashboard, /legend-dot donation/);
  assert.match(stakeholderDashboard, /background: MAP_COLORS\.stakeholder/);
});
