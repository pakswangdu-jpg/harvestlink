import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Order overview preserves all five status filters, labels and helper text', async () => {
  const source = await readFile(new URL('../src/components/orders/OrderStatusSummary.jsx', import.meta.url), 'utf8');
  assert.match(source, /import \{ AlertTriangle,/);
  assert.match(source, /status: 'pending', label: 'New orders', count: stageCounts\.pending,[\s\S]*?icon: AlertTriangle, tone: 'attention'/);
  for (const value of [
    "status: 'pending', label: 'New orders'",
    "status: 'to_prepare', label: 'To prepare'",
    "status: 'ready_for_pickup', label: 'Ready for pickup'",
    "status: 'out_for_delivery', label: 'Out for delivery'",
    "status: 'completed', label: 'Completed'",
    "description: 'Awaiting confirmation'",
    "description: 'Confirmed orders'",
    "description: 'Waiting for buyer'",
    "description: 'Currently in transit'",
    "description: 'Fulfilled orders'",
  ]) assert.ok(source.includes(value), value);
  assert.match(source, /aria-pressed=\{activeStage === status\}/);
  assert.match(source, /onClick=\{\(\) => onSelectStage\(status\)\}/);
  assert.match(source, /stageCounts\.pending/);
  assert.match(source, /stageCounts\.confirmed \+ stageCounts\.preparing/);
});

test('Order overview uses separated responsive status cards and a secondary tab row', async () => {
  const css = await readFile(new URL('../src/components/orders/OrderStatusSummary.css', import.meta.url), 'utf8');
  const ordersCss = await readFile(new URL('../src/features/farmer/FarmerOrders.css', import.meta.url), 'utf8');
  assert.match(css, /\.order-status-summary-list \{\s*display: grid;[\s\S]*?gap: 12px;[\s\S]*?border: 0/);
  assert.match(css, /\.order-status-summary-item \{[\s\S]*?min-height: 164px;[\s\S]*?padding: 16px;[\s\S]*?border: 1px solid var\(--status-border\)/);
  assert.match(css, /\.order-status-summary-count \{[\s\S]*?font-size: 36px;[\s\S]*?font-weight: 600/);
  assert.match(css, /\.order-status-summary-icon \{[\s\S]*?width: 28px;[\s\S]*?background: color-mix/);
  assert.match(css, /\.order-status-summary-label \{[\s\S]*?font-size: 16px;[\s\S]*?font-weight: 600/);
  assert.match(css, /\.order-status-summary-description \{[\s\S]*?font-size: 14px;[\s\S]*?line-height: 1\.5/);
  assert.match(css, /@container \(min-width: 940px\)[\s\S]*?grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /@container \(min-width: 600px\) and \(max-width: 939px\)[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@container \(max-width: 419px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?\.order-status-summary-list \{\s*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\[data-theme='dark'\] \.order-status-summary-item \{[\s\S]*?--status-border: #46534b;[\s\S]*?--status-surface: #202723/);
  assert.match(css, /\[data-theme='dark'\] \.order-status-summary-pickup \{[\s\S]*?--status-accent: #8db9ad;[\s\S]*?--status-surface: #222a27/);
  assert.match(ordersCss, /\.farmer-orders-page \.farmer-orders-workspace > \.filter-tabs \{[\s\S]*?margin-top: 2px;[\s\S]*?border-bottom: 1px solid var\(--line\);[\s\S]*?background: transparent/);
  assert.match(ordersCss, /\.farmer-orders-page \.farmer-orders-workspace \.filter-tab\.active \{[\s\S]*?border-bottom-color: var\(--green-700\);[\s\S]*?background: transparent;[\s\S]*?box-shadow: none/);
});
