import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({ setTimeout, clearTimeout, DOMException });
const modules = new Map();
async function load(path) {
  const url = new URL(path, import.meta.url);
  if (!url.pathname.endsWith('.js')) url.pathname += '.js';
  if (modules.has(url.href)) return modules.get(url.href);
  const module = new vm.SourceTextModule(await readFile(url, 'utf8'), { context, identifier: url.href });
  modules.set(url.href, module);
  await module.link((specifier, parent) => load(new URL(specifier, parent.identifier).href));
  return module;
}
const parserModule = await load('../src/utils/reverseGeocodeResult.js');
await parserModule.evaluate();
const { parseReverseGeocodeResults } = parserModule.namespace;
const deviceModule = await load('../src/utils/deviceLocation.js');
await deviceModule.evaluate();
const { getAccurateDeviceLocation } = deviceModule.namespace;
const component = (name, type, shortName = name) => ({ long_name: name, short_name: shortName, types: [type] });
const result = (components, formattedAddress = '') => ({ address_components: components, formatted_address: formattedAddress });

test('reverse geocoding fills city, barangay, street, and postcode across results', () => {
  const location = parseReverseGeocodeResults([
    result([component('Mandaue', 'locality')], 'Mandaue, Cebu, Philippines'),
    result([
      component('271', 'street_number'), component('A. Del Rosario Street', 'route'),
      component('Mantuyong', 'sublocality_level_1'), component('6014', 'postal_code'),
      component('Cebu', 'administrative_area_level_2'), component('Philippines', 'country', 'PH'),
    ]),
  ]);
  assert.equal(location.municipality, 'Mandaue City');
  assert.equal(location.barangay, 'Mantuyong');
  assert.equal(location.street, '271 A. Del Rosario Street');
  assert.equal(location.zipCode, '6014');
});

test('city aliases and administrative city components match the dropdown', () => {
  for (const [name, expected] of [
    ['City of Mandaue', 'Mandaue City'], ['Lapu Lapu', 'Lapu-Lapu City'], ['Cebu', 'Cebu City'],
  ]) {
    const location = parseReverseGeocodeResults([result([
      component('Looc', 'locality'), component(name, 'administrative_area_level_3'),
      component('Cebu', 'administrative_area_level_2'),
    ])]);
    assert.equal(location.municipality, expected);
    assert.equal(location.barangay, 'Looc');
  }
});

test('formatted city is used when Google labels the locality as a barangay', () => {
  const location = parseReverseGeocodeResults([result([
    component('Looc', 'locality'),
  ], 'Looc, Mandaue City, Cebu, Philippines')]);
  assert.equal(location.municipality, 'Mandaue City');
  assert.equal(location.barangay, 'Looc');
});

test('another province or country cannot match a same-named Cebu city', () => {
  for (const components of [
    [component('Talisay', 'locality'), component('Batangas', 'administrative_area_level_2')],
    [component('Naga', 'locality'), component('Other country', 'country', 'US')],
  ]) {
    assert.equal(parseReverseGeocodeResults([result(components)]).municipality, null);
  }
});

test('missing address parts stay empty and house numbers are not mixed between results', () => {
  const location = parseReverseGeocodeResults([
    result([component('99', 'street_number'), component('Mandaue', 'locality')]),
    result([component('Main Street', 'route')]),
  ]);
  assert.equal(location.street, 'Main Street');
  assert.equal(location.barangay, '');
  assert.equal(location.zipCode, '');
  assert.equal(parseReverseGeocodeResults([]), null);
});

function fakeGeolocation() {
  const cleared = [];
  const callbacks = {};
  return {
    cleared,
    callbacks,
    watchPosition(success, error, options) {
      Object.assign(callbacks, { success, error, options });
      return 7;
    },
    clearWatch(id) { cleared.push(id); },
  };
}
const position = (accuracy) => ({ coords: { latitude: 10.33, longitude: 123.94, accuracy } });

test('device location waits for improved accuracy and stops watching at the target', async () => {
  const geo = fakeGeolocation();
  const pending = getAccurateDeviceLocation(geo);
  geo.callbacks.success(position(200));
  geo.callbacks.success(position(80));
  geo.callbacks.success(position(35));
  assert.equal((await pending).coords.accuracy, 35);
  assert.deepEqual(geo.cleared, [7]);
  assert.equal(geo.callbacks.options.enableHighAccuracy, true);
  assert.equal(geo.callbacks.options.maximumAge, 0);
});

test('deadline returns the best reading instead of the most recent reading', async () => {
  const geo = fakeGeolocation();
  const pending = getAccurateDeviceLocation(geo, { timeout: 10 });
  geo.callbacks.success(position(80));
  geo.callbacks.success(position(200));
  assert.equal((await pending).coords.accuracy, 80);
  assert.deepEqual(geo.cleared, [7]);
});

test('location permission denial rejects and releases the watch', async () => {
  const geo = fakeGeolocation();
  const pending = getAccurateDeviceLocation(geo);
  geo.callbacks.error({ code: 1 });
  await assert.rejects(pending, { code: 1 });
  assert.deepEqual(geo.cleared, [7]);
});

test('aborting a location request releases the watch', async () => {
  const geo = fakeGeolocation();
  const controller = new AbortController();
  const pending = getAccurateDeviceLocation(geo, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.deepEqual(geo.cleared, [7]);
});
