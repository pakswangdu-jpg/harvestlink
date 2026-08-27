import crypto from 'node:crypto';

// Verifies an incoming Lalamove webhook actually came from Lalamove before any handler runs.
//
// IMPORTANT — confirm before relying on this: Lalamove's public docs are explicit about the
// HMAC-SHA256 scheme its own /v3 API requests use (Authorization: hmac KEY:TIMESTAMP:SIGNATURE
// — see lalamoveClient.js), but do not clearly publish the exact webhook-signing header name
// in a form this codebase could verify without a live account. This checks the same
// `Authorization: hmac KEY:TIMESTAMP:SIGNATURE` header/scheme against LALAMOVE_WEBHOOK_SECRET,
// since that's Lalamove's own documented signing convention elsewhere — but the very first
// real webhook delivery (once registered via Lalamove's Partner Portal) should be logged and
// checked against whatever header it actually arrives with, and this adjusted if it differs.
//
// Requires req.rawBody (see app.js's express.json `verify` option) — the signature covers the
// exact bytes Lalamove sent, not Express's re-serialized parsed object.
export function verifyLalamoveWebhook(req, res, next) {
  const authHeader = req.get('Authorization') || '';
  const match = authHeader.match(/^hmac (.+):(\d+):([a-f0-9]{64})$/i);
  if (!match) {
    res.status(401).json({ error: 'Missing or malformed webhook signature.' });
    return;
  }
  const [, key, timestamp, signature] = match;
  if (key !== process.env.LALAMOVE_API_KEY) {
    res.status(401).json({ error: 'Unrecognized webhook key.' });
    return;
  }

  const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
  const stringToSign = `${timestamp}\r\nPOST\r\n/api/webhooks/lalamove\r\n\r\n${rawBody}`;
  const expected = crypto.createHmac('sha256', process.env.LALAMOVE_WEBHOOK_SECRET || process.env.LALAMOVE_API_SECRET)
    .update(stringToSign).digest('hex');

  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const isValid = signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  if (!isValid) {
    res.status(401).json({ error: 'Invalid webhook signature.' });
    return;
  }

  next();
}
