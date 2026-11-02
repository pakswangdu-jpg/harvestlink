import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Product reviews have shared standalone styling on product details and quick view', async () => {
  const [component, css, quickViewCss, details] = await Promise.all([
    readFile(new URL('../src/components/products/ProductReviewsFeed.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/products/ProductReviewsFeed.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/cards/ProductQuickView.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/marketplace/ProductDetails.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(component, /import '\.\/ProductReviewsFeed\.css'/);
  assert.match(details, /<ProductReviewsFeed productId=\{product\.id\} productName=\{product\.name\} className="panel" \/>/);
  assert.match(component, /getRatingsForProduct\(productId\)/);
  assert.match(component, /No reviews for this product yet/);
  assert.match(css, /\.product-reviews-feed-heading\s*\{\s*display: flex/);
  assert.match(css, /\.product-review-item\s*\{[^}]*border: 1px solid var\(--line\);[^}]*background: var\(--panel-subtle\)/);
  assert.match(css, /\.product-review-avatar\s*\{[^}]*border-radius: 50%;/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(quickViewCss, /\.product-quick-view-overlay \.product-quick-view \.product-reviews-feed\s*\{[^}]*border-top: 1px solid var\(--line\)/);
});

test('farmers can open reviews for a specific product from desktop and mobile listings', async () => {
  const [table, farmerProducts, dialog, card] = await Promise.all([
    readFile(new URL('../src/components/products/ProductTable.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/farmer/FarmerProducts.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/products/ProductReviewsDialog.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/cards/ProductCard.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(table, /label: 'Reviews', icon: MessageSquareText, onClick: \(\) => onReviews\(product\)/);
  assert.match(farmerProducts, /label: 'Reviews', icon: MessageSquareText, onClick: \(\) => openProductReviews\(product\)/);
  assert.match(farmerProducts, /<ProductReviewsDialog product=\{reviewsProduct\}/);
  assert.match(dialog, /ProductReviewsFeed productId=\{product\.id\} productName=\{product\.name\}/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(card, /<ProductReviewsFeed productId=\{product\.id\} productName=\{product\.name\}/);
});
