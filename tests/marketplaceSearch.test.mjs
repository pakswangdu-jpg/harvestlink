import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { matchesMarketplaceProduct } from '../src/utils/marketplaceSearch.js';

const listing = {
  id: 'product-cabbage-01',
  name: 'Fresh Cabbage',
  category: 'Vegetables',
  location: 'Mandaue City',
  farmerName: 'Juan Dela Cruz',
  farmerFarmName: 'Green Valley Farm',
};

test('marketplace search finds product, user, farm, and location names', () => {
  for (const query of ['cabbage', 'Juan Dela Cruz', 'Green Valley', 'Mandaue City', 'product-cabbage-01']) {
    assert.equal(matchesMarketplaceProduct(listing, query), true, query);
  }
});

test('multiword search matches tokens across fields and ignores casing/diacritics', () => {
  assert.equal(matchesMarketplaceProduct(listing, 'CABBAGE mandaue'), true);
  assert.equal(matchesMarketplaceProduct({ ...listing, farmerName: 'José Reyes' }, 'jose reyes'), true);
  assert.equal(matchesMarketplaceProduct(listing, 'cabbage Cebu'), false);
});

test('every word must match the listing search fields', () => {
  assert.equal(matchesMarketplaceProduct(listing, 'Cabbage Unknown'), false);
  assert.equal(matchesMarketplaceProduct(listing, '  '), true);
});

test('marketplace searches use listings available to all marketplace roles', async () => {
  const [page, service, routes] = await Promise.all([
    readFile(new URL('../src/features/marketplace/Marketplace.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/productService.js', import.meta.url), 'utf8'),
    readFile(new URL('../backend/src/routes/products.routes.js', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /getMarketplaceProducts\(\)/);
  assert.match(page, /matchesMarketplaceProduct\(product, normalized\)/);
  assert.match(service, /\/products\/marketplace/);
  assert.match(routes, /requireRole\('farmer', 'buyer', 'stakeholder'\), listMarketplaceProducts/);
});
