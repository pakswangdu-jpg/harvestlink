import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { confirmGcashPayment, startGcashCheckout } from '../controllers/payments.controller.js';

const router = Router();

// The webhook route (POST /api/payments/gcash/webhook) is intentionally NOT registered
// here — it needs the raw request body for PayMongo's signature check, so it's mounted
// directly in app.js, ahead of the global express.json() parser. See handleGcashWebhook's
// own doc comment in payments.controller.js.
router.post('/gcash/:orderId/checkout', requireAuth, startGcashCheckout);
router.post('/gcash/:orderId/confirm', requireAuth, confirmGcashPayment);

export default router;
