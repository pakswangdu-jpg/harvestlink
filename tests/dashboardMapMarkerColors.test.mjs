import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Farmer Active Users keeps other Farmer markers green even when a donation alert is active', async () => {
  const icon = await read('../src/components/map/farmerMapMarkerIcon.js');

  assert.match(icon, /farmerMarkersGreen \|\| \(isYou && currentUserGreen\)\s*\?\s*MAP_COLORS\.farmer\s*:\s*donationAlert \? DONATION_MARKER_COLOR : MAP_COLORS\.farmer/);
  assert.match(icon, /new mapsApi\.Size\(width, iconHeight\)/);
  assert.match(icon, /new mapsApi\.Point\(width \/ 2, isYou \? iconHeight \* \(38 \/ viewBoxHeight\) : height\)/);
});

test('authenticated role pins keep their role color and add an anchored account dot below the pin', async () => {
  const [farmer, buyer, stakeholder] = await Promise.all([
    read('../src/components/map/farmerMapMarkerIcon.js'),
    read('../src/components/map/buyerMapMarkerIcon.js'),
    read('../src/components/map/donateMapMarkerIcon.js'),
  ]);
  for (const icon of [farmer, buyer, stakeholder]) {
    assert.match(icon, /const viewBoxHeight = isYou \? 42 : 32/);
    assert.match(icon, /const iconHeight = isYou \? height \+ 12 : height/);
    assert.match(icon, /<circle cx="12" cy="38" r="4" fill="\$\{MAP_COLORS\.viewer\}" stroke="#ffffff" stroke-width="1\.5"\/>/);
    assert.match(icon, /new mapsApi\.Point\(width \/ 2, isYou \? iconHeight \* \(38 \/ viewBoxHeight\) : height\)/);
  }
  assert.match(farmer, /donationAlert \? DONATION_MARKER_COLOR : MAP_COLORS\.farmer/);
  assert.match(farmer, /isYou && currentUserGreen[\s\S]*?MAP_COLORS\.farmer/);
  assert.match(farmer, /farmerMarkersGreen \|\| \(isYou && currentUserGreen\)/);
  assert.match(buyer, /isYou && currentUserGreen \? MAP_COLORS\.farmer : MAP_COLORS\.buyer/);
  assert.match(stakeholder, /isYou && currentUserGreen \? MAP_COLORS\.farmer : color/);
});

test('the signed-in account badge is applied to matching role pins across maps', async () => {
  const [farmerIcon, buyerIcon, stakeholderIcon, donateIcon, farmerMap, deliveryMap] = await Promise.all([
    read('../src/components/map/farmerMapMarkerIcon.js'),
    read('../src/components/map/buyerMapMarkerIcon.js'),
    read('../src/components/map/stakeholderMapMarkerIcon.js'),
    read('../src/components/map/donateMapMarkerIcon.js'),
    read('../src/components/map/FarmerMap.jsx'),
    read('../src/components/orders/DeliveryMap.jsx'),
  ]);
  for (const icon of [farmerIcon, buyerIcon, donateIcon]) {
    assert.match(icon, /r="7" fill="#ffffff" stroke="#0c4a6e" stroke-width="2"/);
    assert.match(icon, /cx="12" cy="38" r="4" fill="\$\{MAP_COLORS\.viewer\}" stroke="#ffffff"/);
    assert.match(icon, /iconHeight \* \(38 \/ viewBoxHeight\)/);
  }
  assert.match(stakeholderIcon, /alert, isYou/);
  for (const mapSource of [farmerMap, deliveryMap]) {
    assert.match(mapSource, /String\((?:farmer|buyer|stakeholder)\.id\) === String\(currentUserId\)/);
    assert.match(mapSource, /buildBuyerMapMarkerIcon\(mapsApi, \{ isYou(?:, currentUserGreen)? \}\)/);
    assert.match(mapSource, /buildStakeholderMapMarkerIcon\(mapsApi, \{ isYou(?:, currentUserGreen)? \}\)/);
  }
});

test('map role markers use their role-specific artwork while legends retain role colors', async () => {
  const [colors, farmerMap, deliveryMap, styles, farmerDashboard, buyerDashboard, stakeholderDashboard, stakeholderStyles, farmerMarker, buyerMarker, stakeholderMarker] = await Promise.all([
    read('../src/lib/mapMarkerColors.js'),
    read('../src/components/map/FarmerMap.jsx'),
    read('../src/components/orders/DeliveryMap.jsx'),
    read('../src/styles/globals.css'),
    read('../src/features/farmer/FarmerDashboard.jsx'),
    read('../src/features/buyer/BuyerDashboard.jsx'),
    read('../src/features/stakeholder/StakeholderDashboard.jsx'),
    read('../src/features/stakeholder/StakeholderDashboard.css'),
    read('../src/components/map/farmerMapMarkerIcon.js'),
    read('../src/components/map/buyerMapMarkerIcon.js'),
    read('../src/components/map/donateMapMarkerIcon.js'),
  ]);

  assert.match(colors, /farmer: '#15803d'/);
  assert.match(colors, /buyer: '#2563eb'/);
  assert.match(colors, /stakeholder: '#db2777'/);
  assert.match(farmerMarker, /isYou = false/);
  assert.match(farmerMarker, /isYou && currentUserGreen[\s\S]*?MAP_COLORS\.farmer/);
  assert.match(deliveryMap, /buildFarmerMapMarkerIcon\(mapsApi, \{ donationAlert, isYou, currentUserGreen, farmerMarkersGreen \}\)/);
  assert.match(farmerMarker, /font-size="7"[^>]*>F<\/text>/);
  assert.match(buyerMarker, /font-size="7"[^>]*>B<\/text>/);
  assert.match(stakeholderMarker, /font-size="7"[^>]*>S<\/text>/);
  assert.match(farmerMap, /uniqueProfilesById\(farmers\)[\s\S]*?buildFarmerMapMarkerIcon\(mapsApi/);
  assert.match(farmerMap, /useMemo\(\(\) => uniqueProfilesById\(buyers\), \[buyers\]\)/);
  assert.match(farmerMap, /uniqueBuyers\.forEach\(\(buyer\) => \{[\s\S]*?upsertMarker\('buyer', buyer\.id, coords, \(\) => buildBuyerMapMarkerIcon\(mapsApi, \{ isYou \}\)/);
  assert.match(farmerMap, /uniqueStakeholders\.forEach\(\(stakeholder\) => \{[\s\S]*?buildStakeholderMapMarkerIcon\(mapsApi, \{ isYou \}\)/);
  assert.match(deliveryMap, /useMemo\(\(\) => uniqueProfilesById\(farmers\), \[farmers\]\)/);
  assert.match(deliveryMap, /uniqueFarmers\.forEach\(\(farmer\) => \{[\s\S]*?buildFarmerMapMarkerIcon\(mapsApi/);
  assert.match(deliveryMap, /useMemo\(\(\) => uniqueProfilesById\(buyers\), \[buyers\]\)/);
  assert.match(deliveryMap, /uniqueBuyers\.forEach\(\(buyer\) => \{[\s\S]*?icon: buildBuyerMapMarkerIcon\(mapsApi, \{ isYou, currentUserGreen \}\)[\s\S]*?title: buyer\.name/);
  const deliveryBuyerMarkers = deliveryMap.slice(
    deliveryMap.indexOf('uniqueBuyers.forEach'),
    deliveryMap.indexOf('uniqueStakeholders.forEach'),
  );
  assert.match(deliveryBuyerMarkers, /buildBuyerMapMarkerIcon/);
  assert.match(farmerMap, /upsertMarker\('buyer', buyer\.id, coords, \(\) => buildBuyerMapMarkerIcon\(mapsApi, \{ isYou \}\)/);
  assert.match(styles, /\.legend-dot\.farmer\s*\{\s*background: #15803d;/);
  assert.match(styles, /\.legend-dot\.buyer\s*\{\s*background: #2563eb;/);
  assert.match(styles, /\.legend-dot\.stakeholder\s*\{\s*background: #db2777;/);
  assert.match(styles, /\.legend-dot\.donation\s*\{\s*background: #d94b43;/);
  assert.doesNotMatch(farmerDashboard, /legend-dot donation|showDonationAlerts/);
  assert.match(farmerDashboard, /legend-dot viewer.*Your account/);
  assert.match(farmerDashboard, /currentUserGreen\s+farmerMarkersGreen\s+separateOverlappingPins\s+viewerCoords=/);
  assert.match(deliveryMap, /if \(separateOverlappingPins\)[\s\S]*?else \{\s*syncMarkerPositions\(entries\)/);
  assert.doesNotMatch(farmerDashboard, /animateDonationAlerts/);
  assert.doesNotMatch(buyerDashboard, /legend-dot donation/);
  assert.match(stakeholderStyles, /\.stakeholder-map-legend \.is-stakeholder \{ background: #db2777;/);
  assert.match(stakeholderDashboard, /animateDonationAlerts/);
  assert.doesNotMatch(deliveryMap, /donationAnimation/);
});

test('stakeholder dashboard includes a role-aware Active Users map with its authenticated account', async () => {
  const [dashboard, styles] = await Promise.all([
    read('../src/features/stakeholder/StakeholderDashboard.jsx'),
    read('../src/features/stakeholder/StakeholderDashboard.css'),
  ]);

  assert.match(dashboard, /getNearbyMapProfiles\(\)/);
  assert.match(dashboard, /setState\(\{ available, myRequests, donationFarmers, mapProfiles \}\)/);
  assert.match(dashboard, /includeCurrentRoleProfile\(mapProfiles\.filter\(\(profile\) => profile\.role === 'farmer'\), 'farmer', currentUser\)/);
  assert.match(dashboard, /includeCurrentRoleProfile\(mapProfiles\.filter\(\(profile\) => profile\.role === 'buyer'\), 'buyer', currentUser\)/);
  assert.match(dashboard, /includeCurrentRoleProfile\(mapProfiles\.filter\(\(profile\) => profile\.role === 'stakeholder'\), 'stakeholder', currentUser\)/);
  assert.match(dashboard, /<SectionHeader title="Active Users"/);
  assert.match(dashboard, /<DeliveryMap[\s\S]*?farmers=\{activeMapFarmers\}[\s\S]*?buyers=\{activeMapBuyers\}[\s\S]*?stakeholders=\{activeMapStakeholders\}[\s\S]*?currentUserId=\{currentUser\.id\}/);
  const activeUsersMap = dashboard.slice(dashboard.indexOf('<DeliveryMap'), dashboard.indexOf('/>', dashboard.indexOf('<DeliveryMap')) + 2);
  assert.doesNotMatch(activeUsersMap, /currentUserGreen/);
  assert.match(activeUsersMap, /currentUserId=\{currentUser\.id\}/);
  assert.match(activeUsersMap, /separateOverlappingPins/);
  assert.match(styles, /stakeholder-map-legend \.is-account \{ background: #db2777;/);
  assert.match(styles, /\.stakeholder-map-pair \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.stakeholder-map-pair \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  const surplusMap = dashboard.slice(dashboard.indexOf('<FarmerMap'), dashboard.indexOf('/>', dashboard.indexOf('<FarmerMap')) + 2);
  assert.match(surplusMap, /donationFarmers=\{mapFarmers\}/);
  assert.match(surplusMap, /initialCenter=\{nearbyMapCenter\}/);
  assert.match(surplusMap, /animateDonationAlerts/);
  assert.doesNotMatch(surplusMap, /farmers=|buyers=|stakeholders=/);
  const mapPair = dashboard.slice(dashboard.indexOf('<div className="stakeholder-map-pair">'), dashboard.indexOf('</div>\n    </div>', dashboard.indexOf('<div className="stakeholder-map-pair">')));
  assert.match(mapPair, /<SectionHeader title="Nearby surplus"/);
  assert.match(mapPair, /<SectionHeader title="Active Users"/);
  assert.ok(dashboard.indexOf('<div className="stakeholder-map-pair">') > dashboard.indexOf('</section>', dashboard.indexOf('aria-label="Donation overview"')));
  assert.ok(dashboard.indexOf('<div className="stakeholder-map-pair">') < dashboard.indexOf('aria-label="Needs your attention"'));
});

test('Nearby shows each signed-in role pin alongside the separate viewer location marker', async () => {
  const farmerMap = await read('../src/components/map/FarmerMap.jsx');
  const profileMarkerLoops = farmerMap.slice(
    farmerMap.indexOf('uniqueFarmers.forEach'),
    farmerMap.indexOf('uniqueDonationFarmers.forEach'),
  );

  assert.match(farmerMap, /String\(farmer\.id\) === String\(currentUserId\)/);
  assert.match(farmerMap, /const displayName = isYou \? `\$\{realDisplayName\} \(You\)`/);
  assert.doesNotMatch(profileMarkerLoops, /nearbyView && currentUserId && (?:farmer|buyer|stakeholder)\.id === currentUserId/);
  assert.match(farmerMap, /upsertMarker\('viewer', currentUserId/);
  assert.match(farmerMap, /markerEntry\.role !== 'viewer'[\s\S]*?\|\| markersRef\.current\[getRoleMarkerKey\('viewer', selectedId\)\]/);
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
  assert.match(markerIcon, /PIN_PATH/);
  assert.match(markerIcon, /width = 28, height = 38/);
  assert.match(markerIcon, /new mapsApi\.Size\(width, iconHeight\)/);
  assert.match(markerIcon, /new mapsApi\.Point\(width \/ 2, isYou \? iconHeight \* \(38 \/ viewBoxHeight\) : height\)/);
  assert.match(farmerMarker, /PIN_PATH/);
  assert.match(farmerMarker, /scaledSize: new mapsApi\.Size\(width, iconHeight\)/);
  const stakeholderMarker = await read('../src/components/map/stakeholderMapMarkerIcon.js');
  assert.match(stakeholderMarker, /buildDonateMapMarkerIcon\(mapsApi, width, height, MAP_COLORS\.stakeholder/);
  const buyerMarker = await read('../src/components/map/buyerMapMarkerIcon.js');
  assert.match(buyerMarker, /PIN_PATH/);
  assert.match(buyerMarker, /new mapsApi\.Size\(width, iconHeight\)/);
  assert.match(buyerMarker, /new mapsApi\.Point\(width \/ 2, isYou \? iconHeight \* \(38 \/ viewBoxHeight\) : height\)/);
  assert.match(buyerMarker, /width = 28, height = 38/);
  assert.match(farmerMarker, /anchor: new mapsApi\.Point\(width \/ 2, isYou \? iconHeight \* \(38 \/ viewBoxHeight\) : height\)/);
  assert.match(deliveryMap, /scaledSize: new mapsApi\.Size\(36, 48\)/);
  assert.match(liveDeliveryMap, /scaledSize: new mapsApi\.Size\(32, 56\)/);
  assert.match(liveDeliveryMap, /anchor: new mapsApi\.Point\(16, 56\)/);
  assert.match(liveDeliveryMap, /scaledSize: new mapsApi\.Size\(24, 24\)/);
  assert.match(liveTrackingModal, /scaledSize: new mapsApi\.Size\(34, 45\)/);
  assert.match(adminMap, /user\.role === 'farmer'[\s\S]*?user\.role === 'stakeholder'[\s\S]*?buildStakeholderMapMarkerIcon\(mapsApi\)[\s\S]*?buildBuyerMapMarkerIcon\(mapsApi\)/);
  assert.match(farmerMap, /iconChanged[\s\S]*?existing\.marker\.setIcon\(icon \|\| null\)/);
  assert.match(farmerMap, /existing\.icon\?\.url !== icon\?\.url/);
  assert.match(farmerMap, /validateCoordinates\(initialCenter\?\.lat, initialCenter\?\.lng\)[\s\S]*?\|\| validateCoordinates\(viewerCoords\?\.lat, viewerCoords\?\.lng\)[\s\S]*?\|\| \{ lat: 0, lng: 0 \}/);
  assert.match(farmerMap, /mapRef\.current\.setCenter\(center\)/);
  assert.match(farmerMap, /donationAlert, donationAlert && animateDonationAlerts && !nearbyView/);
  assert.match(farmerMap, /true, animateDonationAlerts && !nearbyView/);
  assert.match(farmerMap, /animateDonationAlerts = false/);
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
