import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Inventory summary cards retain their four labels, values and live calculations', async () => {
  const source = await readFile(new URL('../src/components/products/SummaryCards.jsx', import.meta.url), 'utf8');
  assert.match(source, /label: 'Products'/);
  assert.match(source, /label: 'Active Listings'/);
  assert.match(source, /label: 'Low Stock'/);
  assert.match(source, /label: 'Units in Stock'/);
  assert.match(source, /<span className="inventory-metric-icon-wrap" aria-hidden="true">/);
  assert.match(source, /<Icon size=\{21\} strokeWidth=\{2\} className="inventory-metric-icon" \/>/);
  assert.match(source, /const value = summary\[key\]/);
  assert.match(source, /summary\.total > 0/);
  assert.match(source, /isWarning = !isUnavailable && key === 'lowStock' && value > 0/);
  assert.match(source, /<dd className="inventory-metric-value">\{isUnavailable \? '—' : Number\(value\)\.toLocaleString\('en-US'\)\}<\/dd>/);
});

test('Inventory summary cards preserve their colored surfaces in dark mode', async () => {
  const css = await readFile(new URL('../src/components/products/SummaryCards.css', import.meta.url), 'utf8');
  assert.match(css, /\.inventory-overview-grid \{\s*display: grid;[\s\S]*?gap: 12px/);
  assert.match(css, /\.inventory-metric \{[\s\S]*?min-height: 124px;[\s\S]*?padding: 14px 16px;[\s\S]*?border-radius: 10px/);
  assert.match(css, /\.inventory-metric \{[\s\S]*?font-family: var\(--font-ui\)/);
  assert.match(css, /\.inventory-metric-label \{[\s\S]*?font-size: 15px;[\s\S]*?font-weight: 600/);
  assert.match(css, /\.inventory-metric-value \{[\s\S]*?font-size: 30px;[\s\S]*?font-weight: 600;[\s\S]*?font-variant-numeric: tabular-nums lining-nums/);
  assert.match(css, /\.inventory-metric-hint \{[\s\S]*?font-size: 13px;[\s\S]*?font-weight: 400/);
  assert.match(css, /\.inventory-metric-icon-wrap \{[\s\S]*?width: 24px;[\s\S]*?height: 24px;[\s\S]*?border-radius: 0;[\s\S]*?background: transparent/);
  assert.match(css, /\.inventory-metric-lowStock,[\s\S]*?background: #f5d500/);
  assert.match(css, /@container \(min-width: 600px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@container \(min-width: 1000px\)[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /\[data-theme=['"]dark['"]\] \.farmer-products-page \.inventory-metric \{/);
});

test('Farmer product presentation preserves row data and exposes update dates on mobile', async () => {
  const [card, table, farmerProducts, css] = await Promise.all([
    readFile(new URL('../src/components/cards/SellerProductCard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/products/ProductTable.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/farmer/FarmerProducts.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/farmer/FarmerProducts.css', import.meta.url), 'utf8'),
  ]);
  assert.match(card, /formatDate\(product\.updatedAt\)/);
  assert.match(card, /Updated \{formatDate\(product\.updatedAt\)\}/);
  assert.match(table, /label: 'Product'/);
  assert.match(table, /label: 'Price'/);
  assert.match(table, /label: 'Stock'/);
  assert.match(table, /label: 'Status'/);
  assert.match(table, /label: 'Updated'/);
  assert.match(table, /label: 'Action'/);
  assert.match(table, /onEdit\(product\)/);
  assert.doesNotMatch(table, /Duplicate listing|onDuplicate/);
  assert.doesNotMatch(farmerProducts, /Duplicate listing|openDuplicateDrawer|duplicatingProduct/);
  assert.match(css, /\.farmer-products-page \.table-wrap tbody tr \{\s*height: 68px;/);
  assert.match(css, /\.farmer-products-page \.product-mobile-card \{[\s\S]*?grid-template-columns: 44px minmax\(0, 1fr\) auto/);
  assert.match(css, /\[data-theme='dark'\] \.farmer-products-page \.table-wrap/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?filter-tabs \{\s*width: 100%/);
});
