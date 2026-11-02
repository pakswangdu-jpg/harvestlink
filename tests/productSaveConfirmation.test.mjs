import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('product confirmation uses concise, context-specific copy', async () => {
  const source = await readFile(new URL('../src/components/products/ProductDrawer.jsx', import.meta.url), 'utf8');

  assert.match(source, /'Ready to add this product\?'/);
  assert.match(source, /pendingValues\?\.isDonation[\s\S]*?'List donation'/);
  assert.match(source, /product-save-confirmation-preview/);
  assert.match(source, /PackageOpen/);
  assert.match(source, /<Plus size=\{16\}/);
  assert.match(source, /productImage/);
  assert.match(source, /formatCurrency\(previewPrice\)/);
  assert.match(source, /formatQuantity\(pendingValues\?\.quantity\)/);
  assert.match(source, /result !== true/);
  assert.match(source, /Adding product\.\.\./);
  assert.match(source, /confirmationError/);
  assert.match(source, /document\.body\.style\.overflow = 'hidden'/);
  assert.doesNotMatch(source, /Please review the product details|Are you sure you want to save this product|Buyers will be able to find it in the marketplace/);
});
