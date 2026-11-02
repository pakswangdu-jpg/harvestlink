import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('farmer product form accepts up to 10 individual marketplace photos', async () => {
  const source = await readFile(new URL('../src/components/forms/ProductForm.jsx', import.meta.url), 'utf8');
  assert.match(source, /const MAX_PRODUCT_IMAGES = 10/);
  assert.match(source, /multiple/);
  assert.match(source, /imageUrls\.length \+ files\.length > MAX_PRODUCT_IMAGES/);
  assert.match(source, /imageUrls=\{values\.imageUrls \|\| \[\]\}/);
  assert.match(source, /uploadProductImage\(imageFile, currentUser\.id\)/);
});

test('marketplace product detail and quick view render navigable product photo galleries', async () => {
  const [gallery, details, card] = await Promise.all([
    readFile(new URL('../src/components/products/ProductImageGallery.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/marketplace/ProductDetails.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/cards/ProductCard.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(gallery, /product\.imageUrls/);
  assert.match(gallery, /Next product photo/);
  assert.match(gallery, /product-image-gallery-thumbnails/);
  assert.match(details, /isFarmerOwner \? \([\s\S]*?<ProductImageGallery product=\{product\}/);
  assert.doesNotMatch(details, /<section className="panel product-details-gallery-panel"/);
  assert.match(card, /<ProductImageGallery product=\{product\}/);
});
