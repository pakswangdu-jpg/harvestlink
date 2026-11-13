import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transformWithOxc } from 'vite';
import { loadFrontend } from './helpers/loadFrontend.mjs';

const [geo, wazeNavigation] = await loadFrontend([
  new URL('../src/utils/geo.js', import.meta.url).href,
  new URL('../src/utils/wazeNavigation.js', import.meta.url).href,
]);

async function createWazeButtonHarness({ profiles, destinationRole }) {
  const calls = [];
  const state = [];
  let hookIndex = 0;
  const react = {
    Fragment: 'Fragment',
    createElement(type, props, ...children) {
      return { type, props: { ...props, children } };
    },
    useState(initialValue) {
      const index = hookIndex++;
      state[index] ??= initialValue;
      return [state[index], (value) => { state[index] = value; }];
    },
  };
  const source = (await readFile(new URL('../src/components/orders/WazeNavigationButton.jsx', import.meta.url), 'utf8'))
    .replace(/import[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
    .replace('export default ', '');
  const result = await transformWithOxc(source, 'WazeNavigationButton.jsx', { jsx: { runtime: 'classic' } });
  const component = new Function('scope', `with(scope){${result.code};return WazeNavigationButton;}`)({
    React: react,
    ...react,
    Navigation: 'Navigation',
    getOrderTrackingProfiles: async (id, options) => {
      calls.push(['profiles', id, options]);
      return profiles.current;
    },
    getRegisteredCoordinates: geo.getRegisteredCoordinates,
    buildWazeNavigationUrl: wazeNavigation.buildWazeNavigationUrl,
    window: {
      open: (url, target) => {
        calls.push(['open', url, target]);
        return {
          opener: {},
          location: { replace: (destination) => calls.push(['navigate', destination]) },
          close: () => calls.push(['close']),
        };
      },
    },
  });
  const render = () => {
    hookIndex = 0;
    return component({ orderId: 'order-1', destinationRole });
  };
  return { calls, render };
}

test('builds a Waze deep link that starts navigation to validated coordinates', () => {
  const url = new URL(wazeNavigation.buildWazeNavigationUrl({ lat: '10.3157', lng: '123.8854' }));

  assert.equal(url.origin, 'https://waze.com');
  assert.equal(url.pathname, '/ul');
  assert.equal(url.searchParams.get('ll'), '10.3157,123.8854');
  assert.equal(url.searchParams.get('navigate'), 'yes');
});

test('does not create a Waze link when destination coordinates are invalid', () => {
  assert.equal(wazeNavigation.buildWazeNavigationUrl(null), null);
  assert.equal(wazeNavigation.buildWazeNavigationUrl({ lat: 91, lng: 123 }), null);
  assert.equal(wazeNavigation.buildWazeNavigationUrl({ lat: 10, lng: '' }), null);
});

test('loads the latest delivery destination when Waze is activated', async () => {
  const profiles = { current: { farmer: { latitude: 10, longitude: 123 }, buyer: { latitude: 11, longitude: 124 } } };
  const harness = await createWazeButtonHarness({ profiles, destinationRole: 'buyer' });

  await harness.render().props.children[0].props.onClick();
  profiles.current.buyer = { latitude: 12, longitude: 125 };
  await harness.render().props.children[0].props.onClick();

  assert.deepEqual(harness.calls.filter(([type]) => type === 'profiles'), [
    ['profiles', 'order-1', { fresh: true }],
    ['profiles', 'order-1', { fresh: true }],
  ]);
  assert.deepEqual(harness.calls.filter(([type]) => type === 'navigate').map(([, url]) => new URL(url).searchParams.get('ll')), [
    '11,124',
    '12,125',
  ]);
});

test('buyer pickup navigation targets the farmer coordinates', async () => {
  const profiles = { current: { farmer: { latitude: 10, longitude: 123 }, buyer: { latitude: 11, longitude: 124 } } };
  const harness = await createWazeButtonHarness({ profiles, destinationRole: 'farmer' });

  await harness.render().props.children[0].props.onClick();

  const [navigationCall] = harness.calls.filter(([type]) => type === 'navigate');
  assert.equal(new URL(navigationCall[1]).searchParams.get('ll'), '10,123');
});
