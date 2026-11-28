import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = (await readFile(new URL('../src/components/map/mapPopupMarkup.js', import.meta.url), 'utf8'))
  .replace(/^import .*;?\r?$/gm, '')
  .replaceAll('export function ', 'function ');
const { buildMapPopup, buildRoleMapPopup } = new Function('isRecentlyActive', `${source}; return { buildMapPopup, buildRoleMapPopup };`)(() => true);

test('stakeholder donation popup shows a complete non-duplicated registered address', () => {
  const html = buildMapPopup({
    name: 'Doms Farm',
    address: 'B. Ceniza St, Mandaue City, Cebu, Philippines',
    barangay: 'Subangdaku',
    municipality: 'Mandaue City',
    coords: { lat: 10.3, lng: 123.9 },
    precision: 'Registered location',
    fullAddress: true,
  });

  assert.match(html, /B\. Ceniza St, Subangdaku, Mandaue City, Cebu, Philippines/);
  assert.doesNotMatch(html, /Mandaue City, Cebu, Philippines, Subangdaku/);
});

test('full donation address and profile fields are escaped in the map popup', () => {
  const html = buildMapPopup({
    name: '<script>alert(1)</script> Farm',
    person: '<b>Owner</b>',
    address: '<b>Unsafe</b> St',
    municipality: 'Mandaue City',
    contactNumber: '<img src=x>',
    coords: { lat: 10.3, lng: 123.9 },
    precision: 'Registered location',
    fullAddress: true,
  });

  assert.match(html, /&lt;b&gt;Unsafe&lt;\/b&gt; St, Mandaue City/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; Farm/);
  assert.match(html, /&lt;b&gt;Owner&lt;\/b&gt;/);
  assert.doesNotMatch(html, /<b>Unsafe<\/b>|<script>/);
});

test('role profile popup shows full details and a See details button', () => {
  const html = buildRoleMapPopup({
    profile: {
      id: 'farmer-1',
      name: 'Chad Cyril Lagada',
      farmName: 'Jan Suson Bugtai Farm',
      address: 'Purok 2',
      barangay: 'Gun-ob',
      municipality: 'Lapu-Lapu City',
      contactNumber: '09171234567',
      verificationStatus: 'verified',
      avgRating: 4.9,
      ratingCount: 8,
      productCount: 3,
      lastActiveAt: new Date().toISOString(),
    },
    role: 'farmer',
    coords: { lat: 10.31, lng: 123.95 },
    precision: 'Registered location',
    markerKey: 'farmer:farmer-1',
    links: [{ href: '/messages/direct/farmer-1', label: 'Contact farmer' }],
  });

  assert.match(html, /map-popup-badge is-farmer">Farmer</);
  assert.match(html, /Verified/);
  assert.match(html, /Purok 2, Gun-ob, Lapu-Lapu City/);
  assert.match(html, /09171234567/);
  assert.match(html, /4\.9★ \(8\)/);
  assert.match(html, /3 active listings/);
  assert.match(html, /data-details-marker-key="farmer:farmer-1"/);
  assert.match(html, /See details/);
});
