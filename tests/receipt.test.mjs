import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReceipt, isFinalReceiptReady, receiptDate } from '../backend/shared/receipt.js';
import { renderReceiptEmail } from '../backend/src/lib/receiptEmailTemplate.js';
import { buildReceiptPdf } from '../src/utils/receiptPdf.js';

const order = {
  id: 'abcd1234-0000-4000-8000-000000000001', buyerName: 'Jan Buyer', farmerName: 'Saved Seller', farmerFarmName: 'Saved Farm',
  productName: 'Saved eggplant', quantity: 5, unit: 'kg', unitPrice: 45, deliveryFee: 80, totalAmount: 305,
  paymentMethod: 'gcash', paymentStatus: 'paid', paymentVerificationStatus: 'approved', paymentReferenceNumber: 'REAL-REFERENCE',
  status: 'completed', deliveryMethod: 'courier', deliveryStatus: 'delivered', createdAt: '2026-10-19T00:00:00Z', completedAt: '2026-10-20T08:35:00Z',
};

test('final receipt requires completion, real payment and the correct final fulfillment stage', () => {
  assert.equal(isFinalReceiptReady(order), true);
  for (const patch of [
    { status: 'pending' }, { status: 'confirmed' }, { status: 'cancelled' },
    { paymentStatus: 'pending' }, { paymentStatus: 'refunded' }, { paymentVerificationStatus: 'pending' },
    { paymentVerificationStatus: 'rejected' }, { paymentVerificationStatus: null },
    { deliveryStatus: 'out_for_delivery' }, { deliveryStatus: 'picked_up' },
    { deliveryMethod: 'buyer_pickup', deliveryStatus: 'delivered' },
  ]) assert.equal(isFinalReceiptReady({ ...order, ...patch }), false, JSON.stringify(patch));
  assert.equal(isFinalReceiptReady({ ...order, paymentMethod: 'cod', paymentVerificationStatus: null }), true);
  assert.equal(isFinalReceiptReady({ ...order, deliveryMethod: 'buyer_pickup', deliveryStatus: 'picked_up' }), true);
});

test('receipt uses the saved effective price and authoritative total without current prices or invented discounts', () => {
  const receipt = buildReceipt({ ...order, currentPrice: 999, discountPercent: 90, transactionId: 'GENERATED-ID', internalAdminNotes: 'secret', latitude: 10 });
  assert.equal(receipt.items[0].unitPrice, 45);
  assert.equal(receipt.items[0].total, 225);
  assert.equal(receipt.total, order.totalAmount);
  assert.equal(receipt.orderNumber, 'ABCD1234');
  assert.equal(receipt.payment.reference, 'REAL-REFERENCE');
  assert.equal(receipt.seller.name, 'Saved Seller');
  assert.ok(!JSON.stringify(receipt).includes('GENERATED-ID'));
  assert.ok(!JSON.stringify(receipt).includes('secret'));
  assert.equal(receipt.discount, undefined);
  assert.throws(() => buildReceipt({ ...order, totalAmount: 425 }), { code: 'RECEIPT_DATA_INVALID' });
  for (const unitPrice of [null, NaN, -1, Infinity]) assert.throws(() => buildReceipt({ ...order, unitPrice }));
  assert.equal(buildReceipt({ ...order, unitPrice: 1.25, quantity: 0.5, deliveryFee: 0, totalAmount: 0.63 }).subtotal, 0.63);
});

test('optional references and completion times are never fabricated', () => {
  const receipt = buildReceipt({ ...order, completedAt: null, paymentReferenceNumber: null });
  assert.equal(receipt.completedAt, null);
  assert.equal(receipt.payment.reference, null);
  assert.equal(receipt.delivery.bookingReference, null);
  assert.equal(receipt.delivery.method, 'Third-party courier');
  assert.equal(buildReceipt(order, { delivery: { courier_company: 'Lalamove', booking_reference: 'BOOKING-123' } }).delivery.method, 'Lalamove');
  assert.match(receiptDate('2026-10-19T23:35:00Z', true), /Oct 20, 2026/);
});

test('email is factual, escaped, responsive and has authenticated in-app order and receipt links', () => {
  const receipt = buildReceipt({ ...order, productName: '<img src=x onerror=alert(1)>', buyerName: 'Jan <Buyer>' }, { buyerEmail: 'buyer@example.test' });
  const message = renderReceiptEmail(receipt, 'https://harvestlink.example');
  assert.equal(message.subject, 'HarvestLink receipt - Order ABCD1234');
  assert.ok(message.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!message.html.includes('<img src=x'));
  assert.ok(message.html.includes('buyer@example.test'));
  assert.ok(message.html.includes('/orders/abcd1234-0000-4000-8000-000000000001/receipt'));
  assert.ok(message.html.includes('@media(max-width:600px)'));
  assert.match(message.html, /font-family:[^">]*sans-serif/);
  assert.ok(message.text.includes('Payment status: Paid'));
  assert.ok(message.text.includes('5 kg'));
  assert.ok(!message.text.includes('VAT'));
  assert.ok(!message.html.includes('gradient'));
  assert.throws(() => renderReceiptEmail({ ...receipt, final: false }, 'https://harvestlink.example'));
});

test('PDF uses the same receipt model and handles long names and references with automatic pagination', () => {
  const receipt = buildReceipt({ ...order, productName: 'Long product name '.repeat(60), buyerName: 'Long buyer name '.repeat(25), paymentReferenceNumber: 'REFERENCE'.repeat(40) });
  const pdf = buildReceiptPdf({ receipt });
  const contents = pdf.output();
  assert.ok(contents.includes('PHP 305.00'));
  assert.ok(contents.includes('Transaction completed'));
  assert.ok(pdf.getNumberOfPages() >= 2);
});
