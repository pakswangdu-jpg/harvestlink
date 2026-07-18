import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { confirmGcashPayment, getGcashCheckout } from '../controllers/payments.controller.js';

const router = Router();

router.get('/gcash/:orderId', requireAuth, getGcashCheckout);
router.post('/gcash/:orderId/confirm', requireAuth, confirmGcashPayment);

export default router;
