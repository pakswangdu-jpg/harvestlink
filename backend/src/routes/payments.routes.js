import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  approvePaymentVerification,
  getGcashCheckout,
  rejectPaymentVerification,
  submitPaymentProof,
} from '../controllers/payments.controller.js';

const router = Router();

router.get('/gcash/:orderId', requireAuth, getGcashCheckout);
router.post('/gcash/:orderId/confirm', requireAuth, submitPaymentProof);
router.patch('/gcash/:orderId/approve', requireAuth, approvePaymentVerification);
router.patch('/gcash/:orderId/reject', requireAuth, rejectPaymentVerification);

export default router;
