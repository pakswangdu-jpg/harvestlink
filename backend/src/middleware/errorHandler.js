

import { isTransientNetworkError } from '../lib/resilientFetch.js';

const AUTH_EVENT_CODES = new Set([
  'CAPTCHA_REQUIRED',
  'CAPTCHA_FAILED',
  'CAPTCHA_EXPIRED',
  'CAPTCHA_UNAVAILABLE',
  'INVALID_CREDENTIALS',
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_DEACTIVATED',
  'RATE_LIMITED',
  'AUTH_SERVICE_UNAVAILABLE',
]);

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (req.path.startsWith('/auth/') && AUTH_EVENT_CODES.has(err.code)) {
    console.info(JSON.stringify({
      timestamp: new Date().toISOString(),
      event: err.code,
      path: req.path,
    }));
  }
  if (err.code === 'ADMIN_NETWORK_NOT_ALLOWED') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(403).json({ error: err.code, message: 'Admin access is not allowed from this network.' });
  }
  if (isTransientNetworkError(err)) {
    console.warn('Temporary upstream connection reset:', err.cause?.code || err.message);
    return res.status(503).json({
      code: 'UPSTREAM_UNAVAILABLE',
      error: 'Temporary connection reset. Please try again.',
    });
  }
  if (status >= 500) console.error(err);
  res.status(status).json({
    ...(err.code ? { code: err.code } : {}),
    ...(err.title ? { title: err.title } : {}),
    ...(err.existingProductId ? { existingProductId: err.existingProductId } : {}),
    error: err.message || 'Something went wrong.',
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No route matches ${req.method} ${req.originalUrl}` });
}
