import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { handleGcashWebhook } from './controllers/payments.controller.js';

const app = express();

// A comma-separated CORS_ALLOWED_ORIGIN list covers local dev + the deployed Vercel URL
// at once (e.g. "http://localhost:5173,https://harvestlink.vercel.app").
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim());

app.use(cors({ origin: allowedOrigins }));

// Mounted before express.json(), with express.raw() instead — PayMongo's webhook signature
// is an HMAC over the exact raw request bytes it sent, so this one route needs the
// unparsed Buffer body, not the JSON-parsed object every other route gets (see
// verifyWebhookSignature in backend/src/lib/paymongoService.js).
app.post('/api/payments/gcash/webhook', express.raw({ type: 'application/json' }), handleGcashWebhook);

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
