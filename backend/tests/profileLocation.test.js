import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registrationLocationFields } from '../src/lib/profileLocation.js';

test('registration stores only valid GPS coordinates after a reading at or better than 100 meters', () => {
  assert.deepEqual(registrationLocationFields({
    latitude: '10.3',
    longitude: '123.9',
    locationAccuracyMeters: 100,
  }), { latitude: 10.3, longitude: 123.9 });
});

test('registration rejects missing, invalid, or low-accuracy location readings', () => {
  assert.throws(
    () => registrationLocationFields({ latitude: null, longitude: null, locationAccuracyMeters: 10 }),
    /GPS accuracy of 100 m or better/,
  );
  assert.throws(
    () => registrationLocationFields({ latitude: 10.3, longitude: 123.9, locationAccuracyMeters: null }),
    /GPS accuracy of 100 m or better/,
  );
  assert.throws(
    () => registrationLocationFields({ latitude: 10.3, longitude: 123.9, locationAccuracyMeters: 100.1 }),
    /GPS accuracy of 100 m or better/,
  );
  assert.throws(
    () => registrationLocationFields({ latitude: 91, longitude: 123.9, locationAccuracyMeters: 10 }),
    /Allow device location and capture the account location/,
  );
});
