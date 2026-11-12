import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hasAcceptableRegistrationLocation,
  isAcceptableRegistrationLocationAccuracy,
  MAX_REGISTRATION_LOCATION_ACCURACY_METERS,
} from '../backend/shared/location.js';

test('all account types can satisfy the shared registration GPS location requirement', () => {
  for (const role of ['farmer', 'buyer', 'stakeholder']) {
    const form = {
      role,
      latitude: 10.3,
      longitude: 123.9,
      locationAccuracyMeters: MAX_REGISTRATION_LOCATION_ACCURACY_METERS,
    };
    assert.equal(hasAcceptableRegistrationLocation(form), true);
  }
});

test('registration rejects missing coordinates and GPS accuracy worse than 100 meters', () => {
  const form = { latitude: 10.3, longitude: 123.9, locationAccuracyMeters: 100.01 };
  assert.equal(hasAcceptableRegistrationLocation(form), false);
  assert.equal(hasAcceptableRegistrationLocation({ ...form, locationAccuracyMeters: 30, latitude: null }), false);
  assert.equal(hasAcceptableRegistrationLocation({ ...form, locationAccuracyMeters: 30, longitude: 181 }), false);
});

test('GPS accuracy validation rejects invalid values and accepts the 100 meter boundary', () => {
  assert.equal(isAcceptableRegistrationLocationAccuracy(100), true);
  assert.equal(isAcceptableRegistrationLocationAccuracy('100'), true);
  for (const accuracy of [null, '', -1, 100.01, Infinity, 'unknown']) {
    assert.equal(isAcceptableRegistrationLocationAccuracy(accuracy), false);
  }
});
