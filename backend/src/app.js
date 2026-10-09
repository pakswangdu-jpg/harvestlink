import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRateLimit } from './middleware/apiRateLimit.js';
import { getAllowedOrigins } from './lib/appUrls.js';
import { getTrustedProxies } from './lib/adminNetwork.js';

const app = express();
app.set('trust proxy', getTrustedProxies());

function normalizeOrigin(value) {
  return value.trim().replace(/\/+$/, '').toLowerCase();
}

const allowedOriginPatterns = getAllowedOrigins()
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

function isOriginAllowed(origin) {
  const normalizedOrigin = normalizeOrigin(origin);
  return allowedOriginPatterns.some((pattern) => {
    if (!pattern.includes('*')) return pattern === normalizedOrigin;

    const source = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${source}$`).test(normalizedOrigin);
  });
}

app.use(cors({
  origin(origin, callback) {

    if (!origin || isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }

    console.warn(
      `CORS: blocked origin "${origin}". Allowed patterns: ${allowedOriginPatterns.join(', ') || '(none)'}. `
      + 'Set CORS_ALLOWED_ORIGIN to include this origin.',
    );
    callback(null, false);
  },
}));

app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', apiRateLimit);
app.use('/api', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
