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
// submits proof of payment (a receipt screenshot plus the reference number, sender name,
// and payment time). That submission does NOT mark the order paid by itself — it puts the
// order into payment_verification_status: 'pending', and the farmer must explicitly
// approve or reject it (see approvePaymentVerification / rejectPaymentVerification below)
// before payment_status ever becomes 'paid'. A rejection leaves the order payable again so
// the buyer can correct and resubmit.
// ============================================================================

const MERCHANT_NAME = 'HarvestLink';

// The persisted identifier for a completed payment — generated once the farmer approves
// the buyer's submitted proof (see approvePaymentVerification below).
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

function assertFarmer(req, order) {
  if (req.profile.id !== order.farmer_id) throw new ApiError('You do not have permission to review this payment.', 403);
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
// payment receipt and filled in the reference number/sender name/payment time (see
// src/features/payments/ConfirmGcashPaymentPage.jsx). Puts the order into
// payment_verification_status: 'pending' — it does NOT mark the order paid; only the
// farmer's approval does that (see approvePaymentVerification below). `receiptUrl` is a
// public URL in the payment-receipts bucket, uploaded from the browser beforehand (see
// uploadService.js's uploadPaymentReceipt) — this route only ever receives the resulting
// URL, never the file itself.
export async function submitPaymentProof(req, res) {
  const order = await fetchOrderOr404(req.params.orderId);
  assertBuyer(req, order);
  if (order.payment_method !== 'gcash') throw new ApiError('This order is not a GCash payment.', 400);

  if (order.payment_status === 'paid') {
    throw new ApiError('This order has already been paid.', 400);
  }
  if (order.payment_verification_status === 'pending') {
    throw new ApiError('Your payment is already awaiting verification.', 400);
  }

  const { receiptUrl, referenceNumber, senderName, paymentDatetime, notes } = req.body;
  if (!receiptUrl) throw new ApiError('Upload your payment receipt before submitting.', 400);
  if (!referenceNumber?.trim()) throw new ApiError('Enter the GCash reference number.', 400);
  if (!senderName?.trim()) throw new ApiError('Enter the sender name on the payment.', 400);

  const { data: updated, error } = await supabaseAdmin
    .from('orders')
    .update({
      payment_receipt_url: receiptUrl,
      payment_reference_number: referenceNumber.trim(),
      payment_sender_name: senderName.trim(),
      payment_submitted_at: paymentDatetime ? new Date(paymentDatetime).toISOString() : new Date().toISOString(),
      payment_notes: notes?.trim() || null,
      payment_verification_status: 'pending',
      payment_rejection_reason: null,
    })
    .eq('id', order.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);

  await createNotification({
    userId: updated.buyer_id,
    type: 'payment',
    title: 'Payment submitted',
    message: `Your GCash payment for ${updated.product_name} was submitted and is awaiting verification.`,
    link: `/orders/${updated.id}`,
  });
  await createNotification({
    userId: updated.farmer_id,
    type: 'payment',
    title: 'Payment verification needed',
    message: `${updated.buyer_name} submitted a GCash payment receipt for ${updated.product_name}. Review it to confirm the order.`,
    link: `/orders/${updated.id}`,
  });

  res.json(serializeOrder(updated));
}

// PATCH /api/payments/gcash/:orderId/approve — farmer-only. Marks the order paid and
// generates the real, persisted transaction_id — this is the only place that happens.
export async function approvePaymentVerification(req, res) {
  const order = await fetchOrderOr404(req.params.orderId);
  assertFarmer(req, order);
  if (order.payment_verification_status !== 'pending') {
    throw new ApiError('There is no pending payment verification for this order.', 400);
  }

  const { data: updated, error } = await supabaseAdmin
    .from('orders')
    .update({
      payment_status: 'paid',
      payment_verification_status: 'approved',
      transaction_id: generateTransactionId(),
      paid_at: new Date().toISOString(),
      payment_reviewed_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);

  await createNotification({
    userId: updated.buyer_id,
    type: 'payment',
    title: '🎉 Payment Verified',
    message: `${updated.farmer_name} verified your GCash payment for ${updated.product_name}.`,
    link: `/orders/${updated.id}`,
  });

  res.json(serializeOrder(updated));
}

// PATCH /api/payments/gcash/:orderId/reject — farmer-only, requires a reason. Leaves
// payment_status as 'pending' so the buyer can correct the details and resubmit.
export async function rejectPaymentVerification(req, res) {
  const order = await fetchOrderOr404(req.params.orderId);
  assertFarmer(req, order);
  if (order.payment_verification_status !== 'pending') {
    throw new ApiError('There is no pending payment verification for this order.', 400);
  }

  const reason = req.body.reason?.trim();
  if (!reason) throw new ApiError('Enter a reason for rejecting this payment.', 400);

  const { data: updated, error } = await supabaseAdmin
    .from('orders')
    .update({
      payment_verification_status: 'rejected',
      payment_rejection_reason: reason,
      payment_reviewed_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);

  await createNotification({
    userId: updated.buyer_id,
    type: 'payment',
    title: '❌ Payment Verification Failed',
    message: `${updated.farmer_name} could not verify your GCash payment for ${updated.product_name}: ${reason}`,
    link: `/orders/${updated.id}`,
  });

  res.json(serializeOrder(updated));
}
