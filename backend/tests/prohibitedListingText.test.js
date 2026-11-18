import assert from 'node:assert/strict';
import { test } from 'node:test';
import { containsProhibitedListingText } from '../src/lib/prohibitedListingText.js';

test('matches explicit marijuana and cannabis terms case-insensitively', () => {
  assert.equal(containsProhibitedListingText('Fresh CANNABIS leaves'), true);
  assert.equal(containsProhibitedListingText('Contains marihuana extract'), true);
});

test('does not match ordinary produce or partial-word matches', () => {
  assert.equal(containsProhibitedListingText('Cabbage', 'Fresh potatoes and vegetables'), false);
  assert.equal(containsProhibitedListingText('Cannabisberry'), false);
});

test('normalizes compatibility characters before checking listing text', () => {
  assert.equal(containsProhibitedListingText('Ｍａｒｉｊｕａｎａ'), true);
});
