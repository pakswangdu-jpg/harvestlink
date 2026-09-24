import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { rateLimit } from './middleware/rateLimit.js';

const app = express();

function normalizeOrigin(value) {
  return value.trim().replace(/\/+$/, '').toLowerCase();
}

const allowedOriginPatterns = (process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

function isOriginAllowed(origin) {
  const normalizedOrigin = normalizeOrigin(origin);
  return allowedOriginPatterns.some((pattern) => {
    if (!pattern.includes('*')) return pattern === normalizedOrigin;
    // Escape every regex metacharacter EXCEPT `*`, then let `*` mean "any run of characters".
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
app.use('/api', rateLimit({
  name: 'API',
  limit: (req) => (req.headers.authorization ? 120 : 30),
  windowMs: 60 * 1000,
}));
app.use('/api', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
