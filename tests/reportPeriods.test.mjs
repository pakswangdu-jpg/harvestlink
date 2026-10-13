import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterReportRecords, getMonthlyProfit, getReportPeriodStart, getReportRevenue, getSevenDayOrderCounts, getTotalRevenue, getTopProducts } from '../src/services/reportService.js';

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

test('seven-day order trends group real order dates and current statuses by Cebu day', () => {
  const orders = [
    { status: 'pending', createdAt: '2026-10-03T15:59:59Z', updatedAt: '2026-10-03T15:59:59Z' },
    { status: 'pending', createdAt: '2026-10-03T16:00:00Z', updatedAt: '2026-10-03T16:00:00Z' },
    { status: 'completed', createdAt: '2026-10-09T16:00:00Z', updatedAt: '2026-10-10T09:30:00Z' },
    { status: 'completed', createdAt: '2026-10-10T10:00:01Z', updatedAt: '2026-10-10T10:00:01Z' },
  ];
  const allOrders = getSevenDayOrderCounts(orders, {}, now);
  const pending = getSevenDayOrderCounts(orders, { status: 'pending' }, now);
  const completed = getSevenDayOrderCounts(orders, { status: 'completed', dateField: 'updatedAt' }, now);

  assert.equal(allOrders.length, 7);
  assert.equal(allOrders[0].label, 'Oct 4');
  assert.equal(allOrders.at(-1).fullLabel, 'Oct 10, 2026');
  assert.equal(allOrders.reduce((sum, point) => sum + point.count, 0), 2);
  assert.equal(pending.reduce((sum, point) => sum + point.count, 0), 1);
  assert.equal(completed.at(-1).count, 1);
  assert.equal(completed.reduce((sum, point) => sum + point.count, 0), 1);
});

test('monthly profit trends use paid orders with recorded costs only', () => {
  const orders = [
    { paymentStatus: 'paid', createdAt: '2026-10-09T16:00:00Z', unitPrice: 100, unitCostPrice: 60, quantity: 2 },
    { paymentStatus: 'paid', createdAt: '2026-10-10T09:00:00Z', unitPrice: 50, unitCostPrice: 30, quantity: 1 },
    { paymentStatus: 'pending', createdAt: '2026-10-10T09:00:00Z', unitPrice: 100, unitCostPrice: 10, quantity: 1 },
    { paymentStatus: 'paid', createdAt: '2026-10-10T09:00:00Z', unitPrice: 100, unitCostPrice: null, quantity: 1 },
  ];
  const profit = getMonthlyProfit(orders, 2, now);

  assert.deepEqual(profit.map(({ label }) => label), ['Sep', 'Oct']);
  assert.equal(profit.at(-1).revenue, 100);
  assert.equal(profit[0].revenue, 0);
});

test('all-time revenue switches to yearly points for histories longer than three years', () => {
  const orders = [
    { paymentStatus: 'paid', createdAt: '2018-06-15T10:00:00Z', totalAmount: 100 },
    { paymentStatus: 'paid', createdAt: '2026-09-15T10:00:00Z', totalAmount: 250 },
    { paymentStatus: 'pending', createdAt: '2017-01-01T10:00:00Z', totalAmount: 900 },
  ];
  const yearly = getReportRevenue(orders, 'all', now);
  assert.deepEqual(yearly.map(({ label }) => label), ['2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026']);
  assert.equal(yearly[0].revenue, 100);
  assert.equal(yearly.at(-1).revenue, 250);
  assert.equal(yearly.reduce((sum, point) => sum + point.revenue, 0), 350);
});
