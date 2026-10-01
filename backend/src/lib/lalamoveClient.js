import crypto from 'node:crypto';







const BASE_URL = process.env.LALAMOVE_ENV === 'production'
  ? 'https://rest.lalamove.com/v3'
  : 'https://rest.sandbox.lalamove.com/v3';




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









function toStop(stop) {
  return { coordinates: { lat: String(stop.lat), lng: String(stop.lng) }, address: stop.address };
}



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


    durationMinutes: null,
    expiresAt: data.expiresAt,
    stops: data.stops,
  };
}


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
