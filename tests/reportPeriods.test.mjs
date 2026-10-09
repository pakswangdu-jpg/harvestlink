import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterReportRecords, getReportPeriodStart, getReportRevenue, getTotalRevenue, getTopProducts } from '../src/services/reportService.js';

const now = new Date('2026-10-10T10:00:00Z');
test('report periods follow Cebu calendar boundaries, without inventing missing dates', () => {
  assert.equal(getReportPeriodStart('7d', now).toISOString(), '2026-10-03T16:00:00.000Z');
  assert.equal(getReportPeriodStart('30d', now).toISOString(), '2026-09-10T16:00:00.000Z');
  assert.equal(getReportPeriodStart('6m', now).toISOString(), '2026-04-30T16:00:00.000Z');
  assert.equal(getReportPeriodStart('1y', now).toISOString(), '2025-10-31T16:00:00.000Z');
  const records = [{ createdAt: '2026-10-03T15:59:59Z' }, { createdAt: '2026-10-03T16:00:00Z' }, { createdAt: '2026-10-11T10:00:00Z' }, {}];
  assert.deepEqual(filterReportRecords(records, '7d', now), [records[1]]);
  assert.equal(filterReportRecords(records, 'all', now), records);
});
test('daily and monthly revenue keep paid-order totals and exact dated tooltip labels', () => {
  const orders = [
    { productId: 'p1', productName: 'Cabbage', paymentStatus: 'paid', createdAt: '2026-10-09T16:00:00Z', totalAmount: 150, quantity: 2 },
    { productId: 'p2', productName: 'Carrot', paymentStatus: 'pending', createdAt: '2026-10-09T16:00:00Z', totalAmount: 500, quantity: 2 },
    { productId: 'p3', productName: 'Mango', paymentStatus: 'paid', createdAt: '2026-03-01T00:00:00Z', totalAmount: 200, quantity: 3 },
  ];
  const daily = getReportRevenue(orders, '7d', now);
  assert.equal(daily.length, 7);
  assert.equal(daily.at(-1).revenue, 150);
  assert.equal(daily.at(-1).fullLabel, 'Oct 10, 2026');
  assert.equal(getReportRevenue(orders, '30d', now).length, 30);
  const monthly = getReportRevenue(orders, '6m', now);
  assert.equal(monthly.length, 6);
  assert.equal(monthly.at(-1).fullLabel, 'Oct 2026');
  assert.equal(monthly.reduce((sum, point) => sum + point.revenue, 0), 150);
  assert.equal(getReportRevenue(orders, '1y', now).length, 12);
  assert.equal(getReportRevenue(orders, 'all', now).reduce((sum, point) => sum + point.revenue, 0), getTotalRevenue(orders));
  assert.equal(getTopProducts(filterReportRecords(orders, '7d', now), 10)[0].productId, 'p1');
  assert.deepEqual(getReportRevenue([], 'all', now), []);
});
