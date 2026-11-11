import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('User Locations is an Admin-only sidebar and route module', async () => {
  const [nav, routes, page, profilesRoute] = await Promise.all([
    readFile(new URL('../src/features/admin/adminNav.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/routes.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/admin/AdminUserLocations.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/routes/profiles.routes.js', import.meta.url), 'utf8'),
  ]);
  assert.match(nav, /label: 'User Locations', icon: MapPin/);
  assert.match(routes, /<Route element=\{<AdminProtectedRoute \/>\}>[\s\S]*<Route path="\/admin-user-locations" element=\{<AdminUserLocations \/>}/);
  assert.match(profilesRoute, /router\.get\('\/admin-locations', requireAuth, requireRole\('admin'\), getAdminUserLocations\)/);
  assert.match(page, /new MarkerClusterer/);
  assert.match(page, /algorithmOptions: \{ maxZoom: 14 \}/);
  assert.match(page, /new Set\(positions\)\.size === 1/);
  assert.match(page, /accounts share this registered location/);
  assert.match(page, /clusterInfoContent\(clusterUsers/);
  assert.match(page, /if \(cluster\.bounds\) clusterMap\.fitBounds\(cluster\.bounds, 48\)/);
  assert.match(page, /farmer: MAP_COLORS\.farmer/);
  assert.match(page, /buyer: MAP_COLORS\.buyer/);
  assert.match(page, /stakeholder: MAP_COLORS\.stakeholder/);
  assert.match(page, /import \{ MAP_COLORS \} from '\.\.\/\.\.\/lib\/mapMarkerColors'/);
  assert.doesNotMatch(page, /admin: '#64748b'|Admins on Map|value="admin"/);
  assert.match(page, /user\.role === 'farmer'[\s\S]*?user\.role === 'stakeholder'[\s\S]*?buildStakeholderMapMarkerIcon\(mapsApi\)[\s\S]*?buildBuyerMapMarkerIcon\(mapsApi\)/);
  assert.match(page, /import \{ buildStakeholderMapMarkerIcon \} from '\.\.\/\.\.\/components\/map\/stakeholderMapMarkerIcon'/);
  assert.match(page, /import \{ buildFarmerMapMarkerIcon \} from '\.\.\/\.\.\/components\/map\/farmerMapMarkerIcon'/);
  assert.doesNotMatch(page.slice(page.indexOf('function createRoleMarker'), page.indexOf('function SummaryItem')), /SymbolPath\.CIRCLE/);
});

test('User Locations search, filters, missing coordinates and profile links use registered profile data', async () => {
  const [page, mapCss, migration, usersPage] = await Promise.all([
    readFile(new URL('../src/features/admin/AdminUserLocations.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/admin/AdminUserLocations.css', import.meta.url), 'utf8'),
    readFile(new URL('../supabase/migrations/20261102_admin_profile_location_access.sql', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/admin/AdminUsers.jsx', import.meta.url), 'utf8'),
  ]);
  const { matchesAdminUserLocationSearch } = await import('../src/utils/adminUserLocationSearch.js');
  const searchableUser = {
    name: 'José Juan Santos Dela Cruz',
    email: 'juan@example.com',
    farmName: 'Green Valley Farm',
    organizationName: 'Cebu Food Network',
    address: 'Sitio Riverside',
    barangay: 'Lahug',
    municipality: 'Cebu City',
    zipCode: '6000',
  };
  for (const term of ['juan cruz', 'santos juan', 'JUAN@EXAMPLE.COM', 'green valley', 'cebu network', 'riverside lahug', 'cebu 6000', 'jose']) {
    assert.equal(matchesAdminUserLocationSearch(searchableUser, term), true, `expected search to match ${term}`);
  }
  assert.equal(matchesAdminUserLocationSearch(searchableUser, 'unregistered user'), false);
  assert.match(page, /value=\{search\}[\s\S]*onChange=\{\(event\) => setSearch\(event\.target\.value\)\}/);
  assert.match(page, /matchesAdminUserLocationSearch\(user, query\)/);
  assert.match(page, /<section className="admin-location-search-results" aria-label="Search results">/);
  assert.match(page, /<div className="admin-location-search-result-list" role="list">/);
  assert.match(page, /className="admin-location-search-result" key=\{user\.id\} role="listitem"/);
  assert.match(page, /searchResults\.map\(\(user\)/);
  assert.doesNotMatch(page, /searchResults\.slice\(\s*0,\s*100\s*\)/);
  assert.doesNotMatch(page, /Showing 100 of \{searchResults\.length/);
  assert.match(page, /<strong>\{user\.name \|\| 'Registered user'\}<\/strong>/);
  assert.match(page, /Saved map location' : 'No saved location'/);
  assert.match(page, /navigate\(`\/admin-users\?user=\$\{encodeURIComponent\(user\.id\)\}`\)/);
  assert.match(page, /Matching accounts have no saved map locations/);
  assert.match(page, /const mapUsers = hasFilters \? filteredUsers : locatedUsers/);
  assert.match(mapCss, /\.admin-user-locations-page \.admin-location-search-result-list\s*\{[^}]*display: grid;[^}]*gap: 8px;[^}]*padding: 10px 12px/);
  assert.doesNotMatch(mapCss, /\.admin-user-locations-page \.admin-location-search-result-list\s*\{[^}]*max-height:\s*\d+px|\.admin-user-locations-page \.admin-location-search-result-list\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(mapCss, /\.admin-user-locations-page \.admin-location-search-result\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*border: 1px solid var\(--line\);[^}]*border-radius: 6px/);
  assert.match(mapCss, /\.admin-user-locations-page \.admin-location-search-result-actions\s*\{[^}]*display: grid;[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(mapCss, /\.admin-user-locations-page \.admin-location-search-result-actions button:only-child\s*\{[^}]*grid-column: 1 \/ -1/);
  assert.match(mapCss, /\.admin-user-locations-page \.admin-location-search-result\s*\{[^}]*display: grid;[^}]*min-height: 88px/);
  for (const label of ['All Users', 'Farmers', 'Buyers', 'Stakeholders', 'Active Accounts', 'Pending Accounts', 'Suspended Accounts', 'Deactivated Accounts']) {
    assert.ok(page.includes(label), `expected filter ${label}`);
  }
  assert.doesNotMatch(page, /Admins on Map|>Admins</);
  assert.match(page, /latitude < -90 \|\| latitude > 90 \|\| longitude < -180 \|\| longitude > 180/);
  assert.match(page, /Users Without Saved Locations/);
  assert.match(page, /navigate\(`\/admin-users\?user=\$\{encodeURIComponent\(id\)\}`\)/);
  assert.match(usersPage, /searchParams\.get\('user'\)/);
  assert.match(usersPage, /setSearchParams\(nextParams/);
  assert.match(migration, /security definer/);
  assert.match(migration, /profiles_select_admin/);
  assert.match(migration, /auth\.uid\(\).*is_admin_profile/s);
  assert.match(migration, /revoke select on public\.profiles from authenticated/i);
  assert.match(migration, /grant select\s*\([\s\S]*email[\s\S]*latitude, longitude[\s\S]*\) on public\.profiles to authenticated/i);
  assert.doesNotMatch(migration, /grant select\s*\([\s\S]*contact_number|gov_id_file_url|gcash_number/i);
  assert.match(page, /Registered address/);
  assert.match(page, /Account status/);
  assert.match(page, /verificationLabel\(user\)/);
  assert.match(page, /View Profile/);
  assert.match(mapCss, /@media \(max-width: 640px\)/);
  assert.match(mapCss, /\.admin-user-locations-page \.gm-style \.gm-style-iw-d\s*\{[^}]*max-height: min\(340px, 58vh\) !important;[^}]*overflow: auto !important;/);
  assert.match(mapCss, /\[data-theme='dark'\] \.admin-user-locations-page \.admin-location-info-details dd,[\s\S]*color: #e8eee9 !important;/);
  assert.match(mapCss, /\.admin-location-cluster-info li strong\s*\{[^}]*color: #243447/);
  assert.match(mapCss, /\[data-theme='dark'\] \.admin-user-locations-page \.admin-location-cluster-info li strong\s*\{[^}]*color: #e8eee9/);
});

test('Admin location service fetches every bounded page before returning map data', async (t) => {
  const requestedPages = [];
  const { fetchAllAdminUserLocations } = await import('../src/utils/fetchAdminUserLocations.js');
  const result = await fetchAllAdminUserLocations(async (page) => {
    requestedPages.push(page);
    return {
      users: [{ id: `page-${page}` }],
      total: 1001,
      pageSize: 500,
    };
  });
  assert.deepEqual(requestedPages, [1, 2, 3]);
  assert.deepEqual(result.users.map((user) => user.id), ['page-1', 'page-2', 'page-3']);
  assert.equal(result.total, 1001);
});

test('Admin location paging deduplicates users repeated across API pages', async () => {
  const { fetchAllAdminUserLocations } = await import('../src/utils/fetchAdminUserLocations.js');
  const result = await fetchAllAdminUserLocations(async (page) => ({
    users: page === 1
      ? [{ id: 'same-user', name: 'Old name' }]
      : [{ id: 'same-user', name: 'Updated name' }, { id: `page-${page}` }],
    total: 3,
    pageSize: 1,
  }));
  assert.equal(result.users.filter((user) => user.id === 'same-user').length, 1);
  assert.equal(result.users.find((user) => user.id === 'same-user').name, 'Updated name');
});
