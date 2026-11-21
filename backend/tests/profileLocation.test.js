import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registrationLocationFields } from '../src/lib/profileLocation.js';

test('registration stores valid GPS coordinates for desktop and mobile accuracy readings', () => {
  assert.deepEqual(registrationLocationFields({
    latitude: '10.3',
    longitude: '123.9',
    locationAccuracyMeters: 200,
  }), { latitude: 10.3, longitude: 123.9 });
});

test('registration rejects missing or invalid location readings', () => {
  assert.throws(
    () => registrationLocationFields({ latitude: null, longitude: null, locationAccuracyMeters: 10 }),
    /Allow device location and capture a valid account location/,
  );
  assert.throws(
    () => registrationLocationFields({ latitude: 10.3, longitude: 123.9, locationAccuracyMeters: null }),
    /Allow device location and capture a valid account location/,
  );
  assert.throws(
    () => registrationLocationFields({ latitude: 10.3, longitude: 123.9, locationAccuracyMeters: -5 }),
    /Allow device location and capture a valid account location/,
  );
  assert.throws(
    () => registrationLocationFields({ latitude: 91, longitude: 123.9, locationAccuracyMeters: 10 }),
    /Allow device location and capture a valid account location/,
  );
});
