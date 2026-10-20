import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { canReviewPayment, paymentRejectionReason, paymentReviewKey, receiptPreviewUrl, PAYMENT_REVIEW_CHECKS } from '../src/components/orders/paymentReview.js';

const order = { id: 'order', paymentMethod: 'gcash', paymentStatus: 'pending', paymentVerificationStatus: 'pending', paymentReceiptUrl: 'https://uploads.example/receipt.png', totalAmount: 87, paymentReferenceNumber: 'REAL-REFERENCE', paymentSenderName: 'Saved Sender', paymentSubmittedAt: '2026-10-20T08:00:00Z' };
const actions = { onApprove() {}, onReject() {} };
test('decisions require existing callbacks and a genuinely pending GCash payment; Admin read-only never gains actions', () => {
  assert.equal(canReviewPayment(order, actions), true);
  assert.equal(canReviewPayment(order, { ...actions, readOnly: true }), false);
  assert.equal(canReviewPayment(order, {}), false);
  for (const patch of [{ paymentMethod: 'cod' }, { paymentStatus: 'paid' }, { paymentStatus: 'refunded' }, { paymentVerificationStatus: 'approved' }, { paymentVerificationStatus: 'rejected' }]) {
    assert.equal(canReviewPayment({ ...order, ...patch }, actions), false);
  }
  assert.equal(PAYMENT_REVIEW_CHECKS.length, 4);
});
test('changed evidence invalidates prior manual review; unrelated polling does not reset it', () => {
  const key = paymentReviewKey(order);
  for (const patch of [{ totalAmount: 88 }, { paymentReceiptUrl: 'https://uploads.example/new.png' }, { paymentReferenceNumber: 'NEW-REFERENCE' }, { paymentSenderName: 'New Sender' }, { paymentSubmittedAt: '2026-10-20T09:00:00Z' }, { paymentVerificationStatus: 'approved' }]) {
    assert.notEqual(paymentReviewKey({ ...order, ...patch }), key);
  }
  assert.equal(paymentReviewKey({ ...order, updatedAt: 'later', currentLat: 10 }), key);
});
test('receipt URLs preserve the submitted link and reject script URLs and embedded credentials', () => {
  const url = 'https://uploads.example/receipt.pdf?token=REAL%2FVALUE#page=1';
  assert.equal(receiptPreviewUrl(url), url);
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'https://user:pass@example.test', '', null, {}]) assert.equal(receiptPreviewUrl(value), null);
});
test('rejection categories and notes reuse the existing single reason string', () => {
  assert.equal(paymentRejectionReason('Amount does not match', ''), 'Amount does not match');
  assert.equal(paymentRejectionReason('Receipt unreadable', '  Please upload the full image. '), 'Receipt unreadable: Please upload the full image.');
  assert.equal(paymentRejectionReason('Other', '  Actual reason  '), 'Actual reason');
  assert.equal(paymentRejectionReason('Other', '  '), '');
  assert.equal(paymentRejectionReason('invented category', 'note'), '');
});
test('Admin uses the shared modal read-only; existing Farmer callbacks close only on successful decisions', async () => {
  const admin = await readFile(new URL('../src/features/admin/AdminOrders.jsx', import.meta.url), 'utf8');
  const farmer = await readFile(new URL('../src/features/farmer/FarmerOrders.jsx', import.meta.url), 'utf8');
  const source = await readFile(new URL('../src/components/orders/PaymentVerificationDrawer.jsx', import.meta.url), 'utf8');
  assert.match(admin, /<PaymentVerificationDrawer[^>]+readOnly/);
  assert.doesNotMatch(admin, /import.*(?:approvePaymentVerification|rejectPaymentVerification)/);
  assert.match(farmer, /if \(success\) setVerifyingOrderId\(null\);\s*return success;/);
  assert.match(source, /key=\{paymentReviewKey\(order\)\}/);
  assert.match(source, /submitting\.current \|\|[^\n]+!canReviewPayment/);
  assert.match(source, /disabled=\{busy \|\| !reviewComplete\}/);
  assert.doesNotMatch(source, /receiptAmount|extractedAmount|approveAnyway|window\.confirm/);
});
