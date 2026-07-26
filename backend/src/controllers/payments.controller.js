import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeOrder } from '../lib/serialize.js';
import { createNotification } from '../lib/notify.js';
import { ApiError } from '../lib/ApiError.js';

// ============================================================================
// GCash payment module.
//
// There is no GCash Merchant API integration here, by design — the farmer simply stores
// their own GCash account name, number, and QR code image on their profile (see
// profiles.controller.js's buildRoleFields), and a buyer paying via GCash sees exactly
// that: the farmer's real account details and QR, scans it in their own GCash app, then
// uploads a screenshot of the completed payment as proof. Confirming payment is a manual,
// buyer-attested action (the receipt upload), not an automated callback/webhook.
// ============================================================================

const MERCHANT_NAME = 'HarvestLink';

// The persisted identifier for a completed payment — generated once the buyer actually
// submits their receipt (see confirmGcashPayment below).
function generateTransactionId() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `GC${Date.now().toString(36).toUpperCase()}${random}`;
}

async function fetchOrderOr404(orderId) {
  const { data, error } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single();
  if (error || !data) throw new ApiError('Order was not found.', 404);
  return data;
}

function assertBuyer(req, order) {
  if (req.profile.id !== order.buyer_id) throw new ApiError('You do not have permission to pay for this order.', 403);
}

// GET /api/payments/gcash/:orderId — the order plus the farmer's own real GCash account
// details (account name, number, QR code image) for the checkout page to display. 404s
// with the same "not configured" message whether the farmer never filled in any GCash
// field or only some of them — a half-filled setup isn't payable either way.
export async function getGcashCheckout(req, res) {
  const order = await fetchOrderOr404(req.params.orderId);
  assertBuyer(req, order);
  if (order.payment_method !== 'gcash') throw new ApiError('This order is not a GCash payment.', 400);
  if (order.payment_status === 'paid') throw new ApiError('This order has already been paid.', 400);

  const { data: farmer, error: farmerError } = await supabaseAdmin
    .from('profiles')
    .select('gcash_account_name, gcash_number, gcash_qr_url')
    .eq('id', order.farmer_id)
    .single();
  if (farmerError || !farmer) throw new ApiError('Farmer account was not found.', 404);
  if (!farmer.gcash_account_name || !farmer.gcash_number || !farmer.gcash_qr_url) {
    throw new ApiError('This farmer has not set up GCash payments yet.', 400);
  }

  res.json({
    order: serializeOrder(order),
    merchantName: MERCHANT_NAME,
    gcash: {
      accountName: farmer.gcash_account_name,
      number: farmer.gcash_number,
      qrUrl: farmer.gcash_qr_url,
    },
  });
}

// POST /api/payments/gcash/:orderId/confirm — called once the buyer has uploaded their
// payment receipt (see src/features/payments/GcashPaymentPage.jsx). `receiptUrl` is a
// public URL in the payment-receipts bucket, uploaded from the browser beforehand (see
// uploadService.js's uploadPaymentReceipt) — this route only ever receives the resulting
// URL, never the file itself.
export async function confirmGcashPayment(req, res) {
  const order = await fetchOrderOr404(req.params.orderId);
  assertBuyer(req, order);
  if (order.payment_method !== 'gcash') throw new ApiError('This order is not a GCash payment.', 400);

  // Idempotent — a retried request (e.g. the buyer double-clicked, or a flaky connection
  // resent it) returns the already-paid order instead of erroring or generating a second
  // transaction_id for the same payment.
  if (order.payment_status === 'paid') {
    return res.json(serializeOrder(order));
  }

  const { receiptUrl } = req.body;
  if (!receiptUrl) throw new ApiError('Upload your payment receipt before submitting.', 400);

  const { data: updated, error } = await supabaseAdmin
    .from('orders')
    .update({
      payment_method: 'gcash',
      payment_status: 'paid',
      transaction_id: generateTransactionId(),
      paid_at: new Date().toISOString(),
      payment_receipt_url: receiptUrl,
    })
    .eq('id', order.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);

  // Submission and confirmation are the same instant in this app's GCash flow (no separate
  // farmer/admin approval step exists) — the farmer's notification doubles as both "a
  // receipt came in" and "payment received," since there's nothing left for them to approve.
  await createNotification({
    userId: updated.buyer_id,
    type: 'payment',
    title: 'Payment confirmed',
    message: `Your GCash payment for ${updated.product_name} was confirmed.`,
    link: `/orders/${updated.id}`,
  });
  await createNotification({
    userId: updated.farmer_id,
    type: 'payment',
    title: 'Payment received',
    message: `${updated.buyer_name} submitted a GCash payment receipt for ${updated.product_name}.`,
    link: `/orders/${updated.id}`,
  });

  res.json(serializeOrder(updated));
}
