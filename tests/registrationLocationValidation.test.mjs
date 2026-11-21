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

test('registration accepts valid coordinates from any location regardless of GPS accuracy and rejects invalid values', () => {
  for (const accuracy of [100, 200, 500, 2500]) {
    assert.equal(hasAcceptableRegistrationLocation({ latitude: 14.5995, longitude: 120.9842, locationAccuracyMeters: accuracy }), true);
  }
  assert.equal(hasAcceptableRegistrationLocation({ latitude: null, longitude: 123.9, locationAccuracyMeters: 30 }), false);
  assert.equal(hasAcceptableRegistrationLocation({ latitude: 10.3, longitude: 181, locationAccuracyMeters: 30 }), false);
});

test('GPS accuracy validation rejects invalid values and accepts non-negative readings', () => {
  assert.equal(isAcceptableRegistrationLocationAccuracy(100), true);
  assert.equal(isAcceptableRegistrationLocationAccuracy('200'), true);
  for (const accuracy of [null, '', -1, Infinity, 'unknown']) {
    assert.equal(isAcceptableRegistrationLocationAccuracy(accuracy), false);
  }
});
