import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const source = (await readFile(new URL('../src/components/map/mapPopupMarkup.js', import.meta.url), 'utf8'))
  .replace(/^import .*;?\r?$/gm, '')
  .replaceAll('export function ', 'function ');
const { buildMapPopup } = new Function('isRecentlyActive', `${source}; return { buildMapPopup };`)(() => false);

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

test('full donation address is escaped in the map popup', () => {
  const html = buildMapPopup({
    name: 'Doms Farm',
    address: '<b>Unsafe</b> St',
    municipality: 'Mandaue City',
    coords: { lat: 10.3, lng: 123.9 },
    precision: 'Registered location',
    fullAddress: true,
  });

  assert.match(html, /&lt;b&gt;Unsafe&lt;\/b&gt; St, Mandaue City/);
  assert.doesNotMatch(html, /<b>Unsafe<\/b>/);
});
