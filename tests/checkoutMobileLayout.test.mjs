import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('checkout product summary preserves its compact listing thumbnail', async () => {
  const source = await readFile(new URL('../src/components/checkout/CheckoutProductCard.jsx', import.meta.url), 'utf8');
  assert.match(source, /<img src=\{product\.image\} alt=\{product\.name\} \/>/);
  assert.match(source, /checkout-product-media/);
});

test('checkout mobile header stacks content and actions without squeezing the title', async () => {
  const styles = await readFile(new URL('../src/styles/globals.css', import.meta.url), 'utf8');

  assert.match(styles, /@media \(max-width: 640px\)\s*\{[\s\S]*?\.checkout-page \.page-header\s*\{[^}]*flex-direction:\s*column;[^}]*align-items:\s*stretch;/);
  assert.match(styles, /\.checkout-page \.page-header > div:first-child\s*\{[^}]*width:\s*100%;/);
  assert.match(styles, /\.checkout-page \.page-header-actions\s*\{[^}]*flex-wrap:\s*wrap;[^}]*width:\s*100%;/);
});
