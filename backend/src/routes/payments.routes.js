import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  approvePaymentVerification,
  getGcashCheckout,
  rejectPaymentVerification,
  submitPaymentProof,
} from '../controllers/payments.controller.js';

const router = Router();

router.get('/gcash/:orderId', requireAuth, getGcashCheckout);
router.post('/gcash/:orderId/confirm', requireAuth, rateLimit({ name: 'payment', limit: 5, windowMs: 60 * 1000, key: (req) => req.profile.id }), submitPaymentProof);
router.patch('/gcash/:orderId/approve', requireAuth, approvePaymentVerification);
router.patch('/gcash/:orderId/reject', requireAuth, rejectPaymentVerification);

export default router;
