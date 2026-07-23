import { createHmac, timingSafeEqual } from 'crypto';
import { ApiError } from './ApiError.js';

const API_BASE = 'https://api.paymongo.com/v1';

// PayMongo authenticates via HTTP Basic Auth with the secret key as the username and an
// empty password — every call here runs server-side only, so the secret key never reaches
// the frontend (see VITE_PAYMONGO_PUBLIC_KEY, which is unused by this real-money flow).
function authHeader() {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) throw new ApiError('GCash payments are not available right now.', 503);
  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
}

async function paymongoRequest(method, path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = json?.errors?.[0]?.detail || 'PayMongo request failed.';
    throw new ApiError(detail, response.status >= 400 && response.status < 500 ? 400 : 502);
  }
  return json;
}

// PayMongo amounts are always positive integer centavos (min 100 = PHP 1.00) — orders store
// pesos as a decimal, so every amount crossing this boundary gets rounded once, here, rather
// than at each call site.
function toCentavos(pesos) {
  return Math.round(Number(pesos) * 100);
}

// GET /v1/payment_intents/:id — same underlying call whether it's used for a fresh checkout
// page (reusing a still-pending intent) or a return/webhook status check.
export async function retrievePaymentIntent(paymentIntentId) {
  const json = await paymongoRequest('GET', `/payment_intents/${paymentIntentId}`);
  return json.data;
}

// Creates the Payment Intent + a GCash Payment Method + attaches them in one call, and
// returns the real PayMongo checkout redirect URL. `returnUrl` is where PayMongo sends the
// buyer's browser back to once they finish (or cancel) authorizing in GCash.
export async function createGcashCheckout({
  amountPesos, description, returnUrl, billingName, billingEmail, billingPhone,
}) {
  const intentJson = await paymongoRequest('POST', '/payment_intents', {
    data: {
      attributes: {
        amount: toCentavos(amountPesos),
        currency: 'PHP',
        payment_method_allowed: ['gcash'],
        description,
        capture_type: 'automatic',
      },
    },
  });
  const paymentIntentId = intentJson.data.id;

  const methodJson = await paymongoRequest('POST', '/payment_methods', {
    data: {
      attributes: {
        type: 'gcash',
        billing: {
          name: billingName || undefined,
          email: billingEmail || undefined,
          phone: billingPhone || undefined,
        },
      },
    },
  });
  const paymentMethodId = methodJson.data.id;

  const attachJson = await paymongoRequest('POST', `/payment_intents/${paymentIntentId}/attach`, {
    data: {
      attributes: {
        payment_method: paymentMethodId,
        return_url: returnUrl,
      },
    },
  });

  const redirectUrl = attachJson.data.attributes.next_action?.redirect?.url || null;
  if (!redirectUrl) throw new ApiError('PayMongo did not return a GCash checkout link.', 502);

  return { paymentIntentId, redirectUrl, status: attachJson.data.attributes.status };
}

// PayMongo signs webhook deliveries with a "Paymongo-Signature" header shaped like
// `t=<unix_ts>,te=<test_hmac>,li=<live_hmac>` — the HMAC-SHA256 is computed over
// `${timestamp}.${rawBody}` using the webhook endpoint's own secret_key (PAYMONGO_WEBHOOK_SECRET,
// from the response of creating the webhook — see backend/.env.example). Verifying this is
// what stops anyone from POSTing a fake "payment succeeded" straight at our webhook route to
// get an order marked paid for free.
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  if (!webhookSecret || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((part) => part.split('=')),
  );
  const { t: timestamp, li: liveSignature } = parts;
  if (!timestamp || !liveSignature) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', webhookSecret).update(signedPayload).digest('hex');

  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(liveSignature, 'hex');
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}
