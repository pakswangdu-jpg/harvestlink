import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Online payment card uses the supplied icon without changing payment values or destination', async () => {
  const source = await readFile(new URL('../src/features/buyer/BuyerDashboard.jsx', import.meta.url), 'utf8');
  assert.match(source, /assets\/icons\/online-payment-credit-card\.png/);
  const card = source.slice(source.indexOf('className="buyer-summary-item is-online"'), source.indexOf('className="buyer-summary-item is-orders"'));
  assert.match(card, /buyer-online-payment-icon/);
  assert.match(card, /--payment-icon.*onlinePaymentIcon/);
  assert.match(card, /to="\/buyer-orders"/);
  assert.match(card, /paymentMethodFilter: 'gcash'/);
  assert.match(card, /formatCurrency\(onlinePaymentTotal\)/);
  assert.match(card, /points=\{onlinePaymentTrend\}/);
  assert.match(card, /Paid via GCash/);
  const css = await readFile(new URL('../src/features/buyer/BuyerOverview.css', import.meta.url), 'utf8');
  assert.match(css, /\.buyer-online-payment-icon \{[^}]*width: 19px;[^}]*height: 19px;[^}]*background-color: var\(--summary-icon\)/);
  assert.match(css, /-webkit-mask: var\(--payment-icon\)/);
  assert.ok((await readFile(new URL('../src/assets/icons/online-payment-credit-card.png', import.meta.url))).length > 0);
});
