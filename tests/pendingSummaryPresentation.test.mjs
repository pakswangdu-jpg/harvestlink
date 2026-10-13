import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Pending summary stacks its supporting text without truncating the count', async () => {
  const css = await readFile(new URL('../src/features/buyer/BuyerOverview.css', import.meta.url), 'utf8');
  assert.match(css, /\.buyer-summary-item\.is-pending \.buyer-summary-support \{[^}]*flex-direction: column;[^}]*align-items: flex-start;[^}]*gap: 6px/);
  assert.match(css, /\.buyer-summary-item\.is-pending \.buyer-summary-support > span:first-child \{[^}]*overflow: visible;[^}]*white-space: normal;[^}]*text-overflow: clip/);
  const source = await readFile(new URL('../src/features/buyer/BuyerDashboard.jsx', import.meta.url), 'utf8');
  const card = source.slice(source.indexOf('className="buyer-summary-item is-pending"'), source.indexOf('className="buyer-summary-item is-complete"'));
  assert.match(card, /pendingOrders.length/);
  assert.match(card, /recentPendingCount/);
  assert.match(card, /awaiting confirmation/);
  assert.doesNotMatch(card, /Needs attention/);
  assert.match(card, /BuyerSummaryTrend points=\{pendingTrend\}/);
  assert.match(card, /state=\{\{ stage: 'pending' \}\}/);
  assert.match(card, /to="\/buyer-orders"/);
});
