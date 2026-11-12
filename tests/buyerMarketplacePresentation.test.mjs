import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Buyer marketplace sections preserve records, recommendation logic and existing actions', async () => {
  const source = await readFile(new URL('../src/features/buyer/BuyerDashboard.jsx', import.meta.url), 'utf8');
  assert.match(source, /freshListings\.slice\(0, 3\)/);
  assert.match(source, /imageUnavailableLabel="Product image unavailable"/);
  assert.match(source, /className="buyer-recent-order-records"\s*responsiveLabels/);
  assert.match(source, /rows=\{orders\.slice\(0, 5\)\}/);
  assert.match(source, /to=\{`\/orders\/\$\{row.id\}`\}/);
  assert.match(source, /visibleRecommendedFarmers\.map/);
  assert.match(source, /<MarketPricePanel commodityId=\{marketCommodityId\} perspective="buyer"/);
});

test('Buyer Messages navigation icon follows theme text color', async () => {
  const source = await readFile(new URL('../src/features/buyer/buyerNav.js', import.meta.url), 'utf8');
  assert.match(source, /const MessagesNavIcon = createMaskNavIcon\(messagesNavIcon\)/);
  assert.doesNotMatch(source, /createElement\('img'/);
});

test('Marketplace shows eligible new listings from all locations by default and refreshes automatically', async () => {
  const source = await readFile(new URL('../src/features/marketplace/Marketplace.jsx', import.meta.url), 'utf8');
  assert.match(source, /const \[location, setLocation\] = useState\(''\)/);
  assert.match(source, /getMarketplaceProducts\(\)/);
  assert.match(source, /setInterval\(reload, 4000\)/);
  assert.match(source, /<option value="">All locations<\/option>/);
});

test('Marketplace keeps the Price Range filter sticky and separate from scrolling filters', async () => {
  const source = await readFile(new URL('../src/features/marketplace/Marketplace.jsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');
  assert.match(source, /<section className="panel marketplace-price-toolbar">\s*<PriceRangeSlider/);
  assert.match(css, /\.marketplace-page \.marketplace-price-toolbar\s*\{[^}]*position: sticky;[^}]*top: 12px;/);
  assert.match(css, /\.marketplace-page \.marketplace-price-toolbar\s*\{[^}]*align-self: start;/);
});

test('Product fallback recovers when the uploaded image URL changes without modifying photos', async () => {
  const source = await readFile(new URL('../src/components/cards/ProductCard.jsx', import.meta.url), 'utf8');
  assert.match(source, /failedImage === product.image/);
  assert.match(source, /loadedImage === product.image/);
  assert.match(source, /onError=\{\(\) => setFailedImage\(product.image\)\}/);
  assert.match(source, /\{imageUnavailableLabel\}/);
  assert.match(source, /onClick=\{inCart && !justAdded \? handleRemoveFromCart : handleAddToCart\}/);
});

test('Buyer-only presentation provides natural card sizes and stacked mobile order records', async () => {
  const css = await readFile(new URL('../src/features/buyer/BuyerMarketplaceSections.css', import.meta.url), 'utf8');
  assert.match(css, /aspect-ratio: 16 \/ 9/);
  assert.match(css, /object-fit: cover/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /@media \(max-width: 1200px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /content: attr\(data-label\)/);
  assert.match(css, /\.buyer-recent-order-records tr \{[^}]*height: auto;[^}]*min-height: 0/);
  assert.doesNotMatch(css, /linear-gradient|backdrop-filter|delivery-map/);
});
