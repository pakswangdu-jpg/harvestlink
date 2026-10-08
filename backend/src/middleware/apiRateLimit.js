import { requireAuth } from './requireAuth.js';
import { rateLimit } from './rateLimit.js';

const anonymousLimit = rateLimit({
  name: 'API', limit: 30, windowMs: 60000,
  key: (req) => req.ip || req.socket?.remoteAddress || 'unknown',
});

export function apiRateLimit(req, res, next) {
  if (!req.headers.authorization?.startsWith('Bearer ')) return anonymousLimit(req, res, next);
  return requireAuth(req, res, (error) => {
    if (error) return anonymousLimit(req, res, (limitError) => next(limitError || error));
    next();
  });
}
