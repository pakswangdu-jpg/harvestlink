import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { DELIVERY_STEP_LABELS } from '../backend/shared/orderLifecycle.js';

const source = (await readFile(new URL('../src/features/admin/adminOrderPresentation.js', import.meta.url), 'utf8'))
  .replace(/^import[^\n]+\n/, '').replaceAll('export ', '');
const { adminOrderId, orderLabel, progressLabel, paymentState, verificationState } = new Function('deliveryStepLabel', 'paymentStatusLabel', `${source}; return {adminOrderId, orderLabel, progressLabel, paymentState, verificationState};`)(
  (value) => DELIVERY_STEP_LABELS[value] || value, (value) => value,
);

test('admin monitoring keeps order status independent from delivery progress', () => {
  assert.equal(orderLabel('confirmed'), 'Confirmed');
  assert.equal(progressLabel({ status: 'confirmed', deliveryStatus: 'packed' }), 'Packed');
  assert.equal(progressLabel({ status: 'pending', deliveryStatus: 'pending' }), 'Awaiting confirmation');
  assert.equal(progressLabel({ status: 'rejected', deliveryStatus: 'pending' }), 'Not started');
  assert.equal(progressLabel({ status: 'cancelled', deliveryStatus: 'preparing' }), 'Cancelled');
  assert.equal(progressLabel({ status: 'confirmed', deliveryStatus: 'ready_for_pickup' }), 'Ready for pickup');
  assert.equal(progressLabel({ status: 'completed', deliveryStatus: 'picked_up' }), 'Picked up');
  assert.equal(adminOrderId('a123bc00-0000-4000-8000-000000000000'), '#HL-A123BC');
});

test('manual GCash verification does not imply a different payment method or paid state', () => {
  const pending = { paymentMethod: 'gcash', paymentStatus: 'pending' };
  assert.equal(paymentState(pending), 'Payment pending');
  assert.equal(verificationState(pending), 'Awaiting receipt');
  assert.equal(verificationState({ ...pending, paymentSubmittedAt: '2026-10-01' }), 'Receipt submitted - under verification');
  assert.equal(verificationState({ ...pending, paymentVerificationStatus: 'approved' }), 'Payment verified');
  assert.equal(paymentState(pending), 'Payment pending');
  assert.equal(verificationState({ ...pending, paymentVerificationStatus: 'rejected' }), 'Payment rejected');
  assert.equal(paymentState({ paymentMethod: 'cod', paymentStatus: 'paid' }), 'Paid');
  assert.equal(verificationState({ paymentMethod: 'cod', paymentStatus: 'pending' }), null);
});
