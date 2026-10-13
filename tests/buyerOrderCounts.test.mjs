import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getBuyerOrderCounts, TO_RECEIVE_STAGES } from '../src/features/buyer/buyerOrderCounts.js';

test('Overview and tabs derive every count from the same stages without mutating orders', () => {
  const orders = ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'cancelled', 'rejected'].map((stage) => Object.freeze({ stage }));
  const { stages, summary } = getBuyerOrderCounts(Object.freeze(orders), (order) => order.stage);
  assert.equal(summary.total, orders.length);
  assert.equal(stages.all, summary.total);
  assert.equal(summary.pending, stages.pending);
  assert.equal(summary.completed, stages.completed);
  assert.equal(summary.cancelled, stages.cancelled + stages.rejected);
  assert.equal(summary.toReceive, 4);
  assert.equal(summary.toReceive, TO_RECEIVE_STAGES.reduce((total, stage) => total + stages[stage], 0));
  assert.equal(stages.confirmed, 1);
  assert.equal(stages.delivered, 1);
  assert.equal(stages.completed, 1);
  assert.equal(stages.cancelled, 2);
  assert.equal(stages.rejected, 1);
});

test('Buyer order stage tabs include rejected stage for buyers', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../src/features/buyer/BuyerOrders.jsx', import.meta.url), 'utf8');
  assert.match(source, /\{\s*key:\s*'rejected',\s*label:\s*'Rejected'\s*\}/);
});

test('Empty order lists and refreshed records produce accurate zero and updated counts', () => {
  assert.deepEqual(getBuyerOrderCounts([], (order) => order.stage).summary, {
    total: 0, pending: 0, toReceive: 0, completed: 0, cancelled: 0,
  });
  const orders = [{ stage: 'delivered' }];
  assert.equal(getBuyerOrderCounts(orders, (order) => order.stage).summary.toReceive, 1);
  const updated = getBuyerOrderCounts([{ stage: 'completed' }], (order) => order.stage);
  assert.equal(updated.summary.toReceive, 0);
  assert.equal(updated.summary.completed, 1);
});
