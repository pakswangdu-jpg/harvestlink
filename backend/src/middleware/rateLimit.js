import { createHash } from 'node:crypto';
import { ApiError } from '../lib/ApiError.js';

const buckets = new Map();
const failedLoginBuckets = new Map();
const CLEANUP_INTERVAL_MS = 60 * 1000;
const FAILED_LOGIN_LIMIT = 5;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
let lastCleanup = 0;

function requestIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function clientKey(req) {
  const authorization = req.headers.authorization || '';
  return authorization.startsWith('Bearer ')
    ? `auth:${createHash('sha256').update(authorization.slice(7)).digest('hex')}`
    : `ip:${requestIp(req)}`;
}

function cleanup(now) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  for (const [key, bucket] of failedLoginBuckets) {
    if (bucket.resetAt <= now) failedLoginBuckets.delete(key);
  }
}

function rateLimitError(name, retryAfter) {
  const error = new ApiError(`Too many ${name} requests. Please try again later.`, 429);
  error.code = 'RATE_LIMITED';
  error.retryAfter = retryAfter;
  return error;
}

export function rateLimit({ limit, windowMs, name, key = clientKey }) {
  return (req, res, next) => {
    const now = Date.now();
    cleanup(now);
    const bucketKey = `${name}:${key(req)}`;
    const bucket = buckets.get(bucketKey);
    const current = bucket && bucket.resetAt > now
      ? bucket
      : { count: 0, resetAt: now + windowMs };
    const max = typeof limit === 'function' ? limit(req) : limit;

    current.count += 1;
    buckets.set(bucketKey, current);
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', Math.max(0, max - current.count));
    res.setHeader('RateLimit-Reset', Math.ceil(current.resetAt / 1000));

    if (current.count > max) {
      res.setHeader('Retry-After', retryAfter);
      next(rateLimitError(name, retryAfter));
      return;
    }
    next();
  };
}

export function emailAndIpKey(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return `${requestIp(req)}:${email || 'missing-email'}`;
}

const loginIpLimit = rateLimit({
  name: 'login',
  limit: 120,
  windowMs: FAILED_LOGIN_WINDOW_MS,
  key: (req) => requestIp(req),
});
const loginAccountRequestLimit = rateLimit({
  name: 'login',
  limit: 30,
  windowMs: FAILED_LOGIN_WINDOW_MS,
  key: emailAndIpKey,
});

export function loginProtection(req, res, next) {
  const now = Date.now();
  cleanup(now);
  const identity = emailAndIpKey(req);
  const failedAttempts = failedLoginBuckets.get(identity);
  if (failedAttempts?.resetAt > now && failedAttempts.count >= FAILED_LOGIN_LIMIT) {
    const retryAfter = Math.max(1, Math.ceil((failedAttempts.resetAt - now) / 1000));
    res.setHeader('Retry-After', retryAfter);
    next(rateLimitError('sign-in attempts', retryAfter));
    return;
  }

  res.once('finish', () => {
    const completedAt = Date.now();
    if (req.loginOutcome === 'invalid-credentials') {
      const current = failedLoginBuckets.get(identity);
      const bucket = current?.resetAt > completedAt
        ? current
        : { count: 0, resetAt: completedAt + FAILED_LOGIN_WINDOW_MS };
      bucket.count += 1;
      failedLoginBuckets.set(identity, bucket);
    } else if (req.loginOutcome === 'authenticated') {
      failedLoginBuckets.delete(identity);
    }
  });

  loginIpLimit(req, res, (ipError) => {
    if (ipError) {
      next(ipError);
      return;
    }
    loginAccountRequestLimit(req, res, next);
  });
}
