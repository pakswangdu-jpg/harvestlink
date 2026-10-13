import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Inventory summary cards retain their four labels, values and live calculations', async () => {
  const source = await readFile(new URL('../src/components/products/SummaryCards.jsx', import.meta.url), 'utf8');
  assert.match(source, /label: 'Products'/);
  assert.match(source, /label: 'Active Listings'/);
  assert.match(source, /label: 'Low Stock'/);
  assert.match(source, /label: 'Units in Stock'/);
  assert.match(source, /const value = summary\[key\]/);
  assert.match(source, /summary\.total > 0/);
  assert.match(source, /isWarning = !isUnavailable && key === 'lowStock' && value > 0/);
  assert.match(source, /<dd className="inventory-metric-value">\{isUnavailable \? '—' : value\}<\/dd>/);
});

test('Inventory summary cards have compact alignment and readable dark-mode surfaces', async () => {
  const css = await readFile(new URL('../src/components/products/SummaryCards.css', import.meta.url), 'utf8');
  assert.match(css, /\.inventory-overview-grid \{\s*display: grid;[\s\S]*?gap: 12px/);
  assert.match(css, /\.inventory-metric \{[\s\S]*?min-height: 120px;[\s\S]*?padding: 16px 18px;[\s\S]*?border-radius: 8px/);
  assert.match(css, /\.inventory-metric \{[\s\S]*?font-family: var\(--font-ui\)/);
  assert.match(css, /\.inventory-metric-label \{[\s\S]*?font-size: 14px;[\s\S]*?font-weight: 500/);
  assert.match(css, /\.inventory-metric-value \{[\s\S]*?font-size: 30px;[\s\S]*?font-weight: 600;[\s\S]*?font-variant-numeric: tabular-nums lining-nums/);
  assert.match(css, /\.inventory-metric-hint \{[\s\S]*?font-size: 13px;[\s\S]*?font-weight: 400/);
  assert.match(css, /@container \(min-width: 380px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@container \(min-width: 880px\)[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\[data-theme='dark'\] \.farmer-products-page \.inventory-metric \{[\s\S]*?background: #202923/);
  assert.match(css, /#d2ae70/);
});

test('Farmer product presentation preserves row data and exposes update dates on mobile', async () => {
  const card = await readFile(new URL('../src/components/cards/SellerProductCard.jsx', import.meta.url), 'utf8');
  const table = await readFile(new URL('../src/components/products/ProductTable.jsx', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/features/farmer/FarmerProducts.css', import.meta.url), 'utf8');
  assert.match(card, /formatDate\(product\.updatedAt\)/);
  assert.match(card, /Updated \{formatDate\(product\.updatedAt\)\}/);
  assert.match(table, /label: 'Product'/);
  assert.match(table, /label: 'Price'/);
  assert.match(table, /label: 'Stock'/);
  assert.match(table, /label: 'Status'/);
  assert.match(table, /label: 'Updated'/);
  assert.match(table, /label: 'Action'/);
  assert.match(table, /onEdit\(product\)/);
  assert.match(table, /onDuplicate\(product\)/);
  assert.match(css, /\.farmer-products-page \.table-wrap tbody tr \{\s*height: 68px;/);
  assert.match(css, /\.farmer-products-page \.product-mobile-card \{[\s\S]*?grid-template-columns: 44px minmax\(0, 1fr\) auto/);
  assert.match(css, /\[data-theme='dark'\] \.farmer-products-page \.table-wrap/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?filter-tabs \{\s*width: 100%/);
});
