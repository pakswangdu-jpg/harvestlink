import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLocationPermissionController } from '../src/services/locationPermissionService.js';

function harness({ permission = 'prompt', secureContext = true, supported = true, querySupported = true } = {}) {
  let state;
  let success;
  let failure;
  let requests = 0;
  const listeners = new Set();
  const permissionStatus = {
    state: permission,
    addEventListener(event, handler) { assert.equal(event, 'change'); listeners.add(handler); },
    removeEventListener(event, handler) { assert.equal(event, 'change'); listeners.delete(handler); },
  };
  const browserNavigator = {
    geolocation: supported ? { getCurrentPosition(onSuccess, onFailure, options) {
      assert.equal(options.enableHighAccuracy, true);
      assert.equal(options.maximumAge, 0);
      assert.equal(options.timeout, 20000);
      requests++; success = onSuccess; failure = onFailure;
    } } : undefined,
    permissions: { query: async ({ name }) => {
      assert.equal(name, 'geolocation');
      if (!querySupported) throw new TypeError('Permission query unsupported');
      return permissionStatus;
    } },
  };
  const controller = createLocationPermissionController({ browserNavigator, secureContext, onChange: (value) => { state = value; } });
  return {
    controller, state: () => state, requests: () => requests, listeners,
    success: () => success({ coords: { latitude: 10.31, longitude: 123.91 } }),
    failure: (code) => failure({ code }),
    change(value) { permissionStatus.state = value; listeners.forEach((handler) => handler()); },
  };
}

test('checking permission does not collect GPS; explicit Enable location requests high accuracy once', async () => {
  const h = harness();
  await h.controller.refresh();
  assert.equal(h.state().permission, 'prompt');
  assert.equal(h.requests(), 0);
  h.controller.request();
  h.controller.request();
  assert.equal(h.requests(), 1);
  assert.equal(h.state().requesting, true);
  h.success();
  assert.equal(h.state().permission, 'granted');
  assert.equal(h.state().requesting, false);
  assert.equal('coords' in h.state(), false);
  assert.equal('latitude' in h.state(), false);
  h.controller.destroy();
});

test('blocked location can recover when browser permission is changed and later revoked', async () => {
  const h = harness();
  await h.controller.refresh();
  h.controller.request();
  h.failure(1);
  assert.equal(h.state().permission, 'denied');
  h.change('granted');
  assert.equal(h.state().permission, 'granted');
  h.change('denied');
  assert.equal(h.state().permission, 'denied');
  await h.controller.refresh();
  assert.equal(h.listeners.size, 1);
  h.controller.destroy();
  assert.equal(h.listeners.size, 0);
});

test('timeout stays distinct from denial and user can retry', async () => {
  const h = harness({ permission: 'granted' });
  await h.controller.refresh();
  h.controller.request();
  h.failure(3);
  assert.equal(h.state().permission, 'granted');
  assert.match(h.state().error, /timed out/);
  h.controller.request();
  assert.equal(h.requests(), 2);
  h.success();
  assert.equal(h.state().error, '');
  h.controller.destroy();
});

test('browsers without Permissions query can still request native location access', async () => {
  const h = harness({ querySupported: false });
  await h.controller.refresh();
  assert.equal(h.state().permission, 'prompt');
  h.controller.request();
  h.success();
  await h.controller.refresh();
  assert.equal(h.state().permission, 'granted');
  h.controller.destroy();
});

test('insecure/unsupported browsers do not attempt GPS; unmounted callbacks cannot update state', async () => {
  for (const options of [{ secureContext: false }, { supported: false }]) {
    const h = harness(options);
    await h.controller.refresh();
    h.controller.request();
    assert.equal(h.requests(), 0);
    assert.equal(h.state().permission, options.supported === false ? 'unsupported' : 'insecure');
    h.controller.destroy();
  }
  const h = harness();
  await h.controller.refresh();
  h.controller.request();
  const before = h.state();
  h.controller.destroy();
  h.success();
  assert.equal(h.state(), before);
});
