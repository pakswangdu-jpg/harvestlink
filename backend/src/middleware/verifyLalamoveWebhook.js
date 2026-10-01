import crypto from 'node:crypto';














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
