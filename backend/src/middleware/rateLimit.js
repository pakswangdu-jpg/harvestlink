import { createHash } from 'node:crypto';
import { ApiError } from '../lib/ApiError.js';

const buckets = new Map();
const CLEANUP_INTERVAL_MS = 60 * 1000;
let lastCleanup = 0;

function clientKey(req) {
  const authorization = req.headers.authorization || '';
  return authorization.startsWith('Bearer ')
    ? `auth:${createHash('sha256').update(authorization.slice(7)).digest('hex')}`
    : `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
}

function cleanup(now) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
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
      next(new ApiError(`Too many ${name} requests. Please try again later.`, 429));
      return;
    }
    next();
  };
}

export function emailAndIpKey(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return `${req.ip || req.socket.remoteAddress || 'unknown'}:${email || 'missing-email'}`;
}
