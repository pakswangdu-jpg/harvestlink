import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('map role markers use their role-specific artwork while legends retain role colors', async () => {
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
  assert.match(farmerMap, /uniqueProfilesById\(farmers\)[\s\S]*?buildFarmerMapMarkerIcon\(mapsApi\)/);
  assert.match(farmerMap, /useMemo\(\(\) => uniqueProfilesById\(buyers\), \[buyers\]\)/);
  assert.match(farmerMap, /uniqueBuyers\.forEach\(\(buyer\) => \{[\s\S]*?upsertMarker\('buyer', buyer\.id, coords, \(\) => buildBuyerMapMarkerIcon\(mapsApi\)/);
  assert.match(farmerMap, /uniqueStakeholders\.forEach\(\(stakeholder\) => \{[\s\S]*?buildStakeholderMapMarkerIcon\(mapsApi\)/);
  assert.match(deliveryMap, /useMemo\(\(\) => uniqueProfilesById\(farmers\), \[farmers\]\)/);
  assert.match(deliveryMap, /uniqueFarmers\.forEach\(\(farmer\) => \{[\s\S]*?buildFarmerMapMarkerIcon\(mapsApi\)/);
  assert.match(deliveryMap, /useMemo\(\(\) => uniqueProfilesById\(buyers\), \[buyers\]\)/);
  assert.match(deliveryMap, /uniqueBuyers\.forEach\(\(buyer\) => \{[\s\S]*?icon: buildBuyerMapMarkerIcon\(mapsApi\)[\s\S]*?title: buyer\.name/);
  const deliveryBuyerMarkers = deliveryMap.slice(
    deliveryMap.indexOf('uniqueBuyers.forEach'),
    deliveryMap.indexOf('uniqueStakeholders.forEach'),
  );
  assert.match(deliveryBuyerMarkers, /buildBuyerMapMarkerIcon/);
  assert.match(farmerMap, /upsertMarker\('buyer', buyer\.id, coords, \(\) => buildBuyerMapMarkerIcon\(mapsApi\)/);
  assert.match(styles, /\.legend-dot\.farmer\s*\{\s*background: #15803d;/);
  assert.match(styles, /\.legend-dot\.buyer\s*\{\s*background: #2563eb;/);
  assert.match(styles, /\.legend-dot\.stakeholder\s*\{\s*background: #db2777;/);
  assert.match(styles, /\.legend-dot\.donation\s*\{\s*background: #d94b43;/);
  assert.match(farmerDashboard, /legend-dot donation/);
  assert.doesNotMatch(buyerDashboard, /legend-dot donation/);
  assert.match(stakeholderDashboard, /background: MAP_COLORS\.stakeholder/);
});

test('all map pins are slightly larger and remain anchored to their location', async () => {
  const [stakeholderDashboard, farmerMap, farmerMapPage, deliveryMap, liveDeliveryMap, liveTrackingModal, adminMap, markerIcon, farmerMarker, markers, viewerMarker] = await Promise.all([
    read('../src/features/stakeholder/StakeholderDashboard.jsx'),
    read('../src/components/map/FarmerMap.jsx'),
    read('../src/features/map/FarmerMapPage.jsx'),
    read('../src/components/orders/DeliveryMap.jsx'),
    read('../src/components/orders/LiveDeliveryMap.jsx'),
    read('../src/components/orders/LiveTrackingModal.jsx'),
    read('../src/features/admin/AdminUserLocations.jsx'),
    read('../src/components/map/donateMapMarkerIcon.js'),
    read('../src/components/map/farmerMapMarkerIcon.js'),
    read('../src/components/map/donationMarker.js'),
    read('../src/components/map/userLocationMarker.js'),
  ]);

  for (const mapSource of [farmerMap, deliveryMap, adminMap]) {
    assert.match(mapSource, /buildStakeholderMapMarkerIcon\(mapsApi/);
    assert.match(mapSource, /buildBuyerMapMarkerIcon\(mapsApi/);
  }
  assert.match(markerIcon, /url: donateMapPin/);
  assert.match(markerIcon, /width = 40, height = 52/);
  assert.match(markerIcon, /new mapsApi\.Size\(width, height\)/);
  assert.match(markerIcon, /new mapsApi\.Point\(width \/ 2, height - 1\)/);
  assert.match(farmerMarker, /import farmerMapPin from '\.\.\/\.\.\/assets\/icons\/farmer-map-pin\.png'/);
  assert.match(farmerMarker, /scaledSize: new mapsApi\.Size\(40, 51\)/);
  const stakeholderMarker = await read('../src/components/map/stakeholderMapMarkerIcon.js');
  assert.match(stakeholderMarker, /buildDonateMapMarkerIcon\(mapsApi, 48, 62\)/);
  const buyerMarker = await read('../src/components/map/buyerMapMarkerIcon.js');
  assert.match(buyerMarker, /buyerMapPin/);
  assert.match(buyerMarker, /new mapsApi\.Size\(width, height\)/);
  assert.match(buyerMarker, /new mapsApi\.Point\(width \/ 2, height - 1\)/);
  assert.match(buyerMarker, /const width = 48;[\s\S]*const height = 62/);
  assert.match(farmerMarker, /anchor: new mapsApi\.Point\(20, 50\)/);
  assert.match(deliveryMap, /scaledSize: new mapsApi\.Size\(36, 48\)/);
  assert.match(liveDeliveryMap, /scaledSize: new mapsApi\.Size\(32, 56\)/);
  assert.match(liveDeliveryMap, /anchor: new mapsApi\.Point\(16, 56\)/);
  assert.match(liveDeliveryMap, /scaledSize: new mapsApi\.Size\(24, 24\)/);
  assert.match(liveTrackingModal, /scaledSize: new mapsApi\.Size\(34, 45\)/);
  assert.match(adminMap, /user\.role === 'farmer'[\s\S]*?user\.role === 'stakeholder'[\s\S]*?buildStakeholderMapMarkerIcon\(mapsApi\)[\s\S]*?buildBuyerMapMarkerIcon\(mapsApi\)/);
  assert.match(farmerMap, /iconChanged[\s\S]*?existing\.marker\.setIcon\(icon \|\| null\)/);
  assert.match(farmerMap, /existing\.icon\?\.url !== icon\?\.url/);
  assert.match(farmerMap, /donationAlert, donationAlert && !nearbyView/);
  assert.match(farmerMap, /true, !nearbyView/);
  assert.match(farmerMap, /existing\.animateGoogleMarker !== animateGoogleMarker/);
  assert.match(farmerMap, /title === 'Your location' \? 1000 : donationAlert \? 750 : 700/);
  assert.match(farmerMap, /existing\.marker\.setZIndex\(zIndex\)/);
  assert.match(viewerMarker, /fill-opacity=".14"/);
  assert.match(viewerMarker, /r="8" fill="white"/);
  assert.match(viewerMarker, /r="5\.5" fill="\$\{MAP_COLORS\.viewer\}"/);
  assert.match(farmerMap, /uniqueFarmers = useMemo\(\(\) => uniqueProfilesById\(farmers\)/);
  assert.match(farmerMap, /uniqueStakeholders = useMemo\(\(\) => uniqueProfilesById\(stakeholders\)/);
  assert.match(farmerMap, /uniqueDonationFarmers = useMemo\(\(\) => uniqueProfilesById\(donationFarmers\)/);
  assert.doesNotMatch(farmerMap, /showStakeholderDonationMarkers/);
  assert.match(deliveryMap, /useMemo\(\(\) => uniqueProfilesById\(stakeholders\), \[stakeholders\]\)/);
  assert.match(adminMap, /user\.role === 'farmer'[\s\S]*?user\.role === 'stakeholder'[\s\S]*?buildStakeholderMapMarkerIcon\(mapsApi\)/);
  assert.doesNotMatch(farmerMapPage, /getAvailableDonations|showStakeholderDonationMarkers/);
  assert.doesNotMatch(stakeholderDashboard, /hasNewDonation/);
  assert.match(stakeholderDashboard, /DONATION_MARKER_COLOR/);
  assert.doesNotMatch(markers, /STAKEHOLDER_DONATION_MARKER_COLOR|isRecentDonation/);
});
