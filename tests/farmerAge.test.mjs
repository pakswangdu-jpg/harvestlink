import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isNewFarmer } from '../src/utils/farmerAge.js';

const now = Date.parse('2026-10-16T12:00:00Z');
const week = 7 * 24 * 60 * 60 * 1000;

test('Farmer is new from registration until exactly seven days have passed', () => {
  assert.equal(isNewFarmer(new Date(now).toISOString(), now), true);
  assert.equal(isNewFarmer(new Date(now - week + 1).toISOString(), now), true);
  assert.equal(isNewFarmer(new Date(now - week).toISOString(), now), false);
  assert.equal(isNewFarmer(new Date(now - week - 1).toISOString(), now), false);
});

test('Missing, invalid and future registration dates do not fabricate new-farmer status', () => {
  for (const value of [undefined, null, '', 'invalid', new Date(now + 1).toISOString()]) {
    assert.equal(isNewFarmer(value, now), false);
  }
});
