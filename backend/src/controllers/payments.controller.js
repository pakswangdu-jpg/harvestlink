import { supabaseAdmin } from '../lib/supabaseClient.js';
import { serializeOrder } from '../lib/serialize.js';
import { ApiError } from '../lib/ApiError.js';
import {
  createGcashCheckout, retrievePaymentIntent, verifyWebhookSignature,
} from '../lib/paymongoService.js';

// ============================================================================
// Real GCash payments via PayMongo's Payment Intents API.
//
// Flow: startGcashCheckout creates a real PayMongo Payment Intent + GCash Payment Method
// and returns PayMongo's own hosted checkout redirect URL — the buyer authorizes with their
// actual GCash account there, not on this site. PayMongo then either (a) redirects the
// buyer's browser back to FRONTEND_URL/orders/:id/pay/gcash?return=1, where
// confirmGcashPayment double-checks the real status directly with PayMongo before marking
// anything paid, or (b) calls handleGcashWebhook server-to-server once the payment actually
// settles — the authoritative source, since it doesn't depend on the buyer's browser still
// being open. Both paths call the same markOrderPaid helper and are idempotent.
// ============================================================================

const FRONTEND_URL = (process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:5173').split(',')[0].trim();

async function fetchOrderOr404(orderId) {
  const { data, error } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single();
  if (error || !data) throw new ApiError('Order was not found.', 404);
  return data;
}

function assertBuyer(req, order) {
  if (req.profile.id !== order.buyer_id) throw new ApiError('You do not have permission to pay for this order.', 403);
}

async function markOrderPaid(order, paymentIntentId) {
  if (order.payment_status === 'paid') return order;
  const { data: updated, error } = await supabaseAdmin
    .from('orders')
    .update({
      payment_status: 'paid',
      transaction_id: paymentIntentId,
      paid_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .eq('payment_status', 'pending') // guards against a concurrent webhook + return-page race double-updating
    .select()
    .single();
  if (error) throw new ApiError(error.message, 400);
  return updated || order;
}

// POST /api/payments/gcash/:orderId/checkout — creates (or, on a page reload before the
// buyer finishes authorizing, reuses) a real PayMongo Payment Intent for this order's exact
// total and returns the real checkout_url to redirect the buyer's browser to.
export async function startGcashCheckout(req, res) {
  const order = await fetchOrderOr404(req.params.orderId);
  assertBuyer(req, order);
  if (order.payment_method !== 'gcash') throw new ApiError('This order is not a GCash payment.', 400);
  if (order.payment_status === 'paid') throw new ApiError('This order has already been paid.', 400);

  const returnUrl = `${FRONTEND_URL}/orders/${order.id}/pay/gcash?return=1`;

  // Reuse the existing intent if the buyer reloads this page before finishing (or abandoning)
  // a previous attempt — avoids piling up duplicate Payment Intents for the same order.
  if (order.paymongo_payment_intent_id) {
    const existing = await retrievePaymentIntent(order.paymongo_payment_intent_id).catch(() => null);
    if (existing?.attributes.status === 'succeeded') {
      await markOrderPaid(order, order.paymongo_payment_intent_id);
      throw new ApiError('This order has already been paid.', 400);
    }
    const redirectUrl = existing?.attributes.next_action?.redirect?.url;
    if (existing?.attributes.status === 'awaiting_next_action' && redirectUrl) {
      res.json({ order: serializeOrder(order), redirectUrl });
      return;
    }
  }

  const { paymentIntentId, redirectUrl } = await createGcashCheckout({
    amountPesos: order.total_amount,
    description: `HarvestLink order ${order.id} — ${order.product_name}`,
    returnUrl,
    billingName: req.profile.name || undefined,
    billingEmail: req.profile.email || undefined,
    billingPhone: req.profile.contact_number || undefined,
  });

  const { error } = await supabaseAdmin
    .from('orders')
    .update({ paymongo_payment_intent_id: paymentIntentId })
    .eq('id', order.id);
  if (error) throw new ApiError(error.message, 400);

  res.json({ order: serializeOrder(order), redirectUrl });
}

// POST /api/payments/gcash/:orderId/confirm — called once the buyer's browser returns from
// PayMongo's checkout. The redirect happening is not itself proof of payment (the buyer may
// have cancelled), so this asks PayMongo directly for the real, current status of the stored
// Payment Intent rather than trusting anything the client asserts.
export async function confirmGcashPayment(req, res) {
  const order = await fetchOrderOr404(req.params.orderId);
  assertBuyer(req, order);
  if (order.payment_method !== 'gcash') throw new ApiError('This order is not a GCash payment.', 400);

  if (order.payment_status === 'paid') {
    res.json(serializeOrder(order));
    return;
  }
  if (!order.paymongo_payment_intent_id) throw new ApiError('No GCash payment was started for this order.', 400);

  const intent = await retrievePaymentIntent(order.paymongo_payment_intent_id);
  if (intent.attributes.status !== 'succeeded') {
    throw new ApiError(`GCash payment status: ${intent.attributes.status.replace(/_/g, ' ')}.`, 400);
  }

  const updated = await markOrderPaid(order, order.paymongo_payment_intent_id);
  res.json(serializeOrder(updated));
}

// POST /api/payments/gcash/webhook — PayMongo's server-to-server delivery once a payment
// settles. Mounted in app.js (not routes/index.js) ahead of express.json(), since signature
// verification needs the exact raw request bytes PayMongo signed, not the re-parsed object.
// Not behind requireAuth — PayMongo isn't a logged-in HarvestLink user; the signature check
// below is what stands in for authentication here.
export async function handleGcashWebhook(req, res) {
  const rawBody = req.body.toString('utf8');
  const signature = req.headers['paymongo-signature'];

  if (!verifyWebhookSignature(rawBody, signature)) {
    throw new ApiError('Invalid webhook signature.', 401);
  }

  const event = JSON.parse(rawBody);
  const eventType = event?.data?.attributes?.type;
  const paymentIntentId = event?.data?.attributes?.data?.attributes?.payment_intent_id;

  if (eventType === 'payment.paid' && paymentIntentId) {
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('paymongo_payment_intent_id', paymentIntentId)
      .maybeSingle();
    if (order) await markOrderPaid(order, paymentIntentId);
  }

  // PayMongo only cares that this 2xx's — payment.failed and any other event type are
  // acknowledged the same way; a failed attempt just leaves the order pending, letting the
  // buyer retry checkout, same as if they'd simply abandoned the GCash redirect.
  res.status(200).json({ received: true });
}
