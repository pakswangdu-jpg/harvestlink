import crypto from 'node:crypto';

// Real Lalamove Open API v3 client — see https://developers.lalamove.com/. Credentials are
// only ever read from process.env here (never sent to or accepted from the frontend — see
// CheckoutForm.jsx/lalamoveService.js, which only ever call HarvestLink's own backend).
// Sandbox by default (LALAMOVE_ENV must be explicitly set to "production" to charge/dispatch
// real drivers) — this is new, unverified code, and defaulting to production would risk a
// real paid delivery from a bug.
const BASE_URL = process.env.LALAMOVE_ENV === 'production'
  ? 'https://rest.lalamove.com/v3'
  : 'https://rest.sandbox.lalamove.com/v3';

// Signing scheme is Lalamove's own (HMAC-SHA256 over "<timestamp>\r\n<METHOD>\r\n<path>\r\n\r\n<body>",
// lowercase hex) — see developers.lalamove.com's authentication guide. `path` must include the
// version prefix ("/v3/quotations") and query string, not just the route.
function sign(method, path, body) {
  const timestamp = Date.now();
  const rawBody = body ? JSON.stringify(body) : '';
  const stringToSign = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${rawBody}`;
  const signature = crypto.createHmac('sha256', process.env.LALAMOVE_API_SECRET).update(stringToSign).digest('hex');
  return { timestamp, signature, rawBody };
}

async function lalamoveRequest(method, path, body) {
  if (!process.env.LALAMOVE_API_KEY || !process.env.LALAMOVE_API_SECRET) {
    throw new Error('Lalamove API credentials are not configured.');
  }
  const { timestamp, signature, rawBody } = sign(method, path, body);

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `hmac ${process.env.LALAMOVE_API_KEY}:${timestamp}:${signature}`,
      Market: process.env.LALAMOVE_MARKET || 'PH',
      'Request-ID': crypto.randomUUID(),
      'Content-Type': 'application/json',
    },
    body: rawBody || undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.errors?.[0]?.message || `Lalamove API returned ${response.status}.`;
    throw new Error(message);
  }
  return payload.data;
}

// stop = { lat, lng, address } — municipality-centroid coordinates paired with the plain-text
// location HarvestLink already has (see orders.controller.js), not a precise street address:
// no part of this app currently collects one (farmer_delivery/buyer_pickup routing is
// municipality-level too — see lib/deliveryFee.js), so a real Lalamove order created from
// this will send the driver to the pickup/drop-off *municipality*, not an exact address. That
// matches this app's existing routing precision everywhere else; it's a real limitation to
// know about before relying on this for an actual dispatched driver, not something this
// integration alone introduces.
function toStop(stop) {
  return { coordinates: { lat: String(stop.lat), lng: String(stop.lng) }, address: stop.address };
}

// Returns { quotationId, fee, distanceKm, durationMinutes, expiresAt } — fee/distance/duration
// come straight from Lalamove's own priceBreakdown/distance, never computed locally.
export async function getQuotation({ pickup, dropoff }) {
  const data = await lalamoveRequest('POST', '/v3/quotations', {
    data: {
      serviceType: 'MOTORCYCLE',
      language: 'en_PH',
      stops: [toStop(pickup), toStop(dropoff)],
    },
  });
  return {
    quotationId: data.quotationId,
    fee: Number(data.priceBreakdown.total),
    distanceKm: data.distance?.value != null ? Number(data.distance.value) / 1000 : null,
    // v3 doesn't return a duration on the quotation itself (only distance) — left null rather
    // than estimated, matching this codebase's "never fabricate a number" rule.
    durationMinutes: null,
    expiresAt: data.expiresAt,
    stops: data.stops,
  };
}

// `quotation` is a getQuotation() result (its `stops` carry the stopId sender/recipient need).
export async function createOrder({ quotation, sender, recipient }) {
  const [pickupStop, dropoffStop] = quotation.stops;
  const data = await lalamoveRequest('POST', '/v3/orders', {
    data: {
      quotationId: quotation.quotationId,
      sender: { stopId: pickupStop.stopId, name: sender.name, phone: sender.phone },
      recipients: [{ stopId: dropoffStop.stopId, name: recipient.name, phone: recipient.phone }],
      partner: 'HarvestLink',
    },
  });
  return { lalamoveOrderId: data.orderId, status: data.status, trackingUrl: data.shareLink || null };
}
