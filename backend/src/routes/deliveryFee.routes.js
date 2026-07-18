import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getDeliveryFeeEstimate } from '../controllers/deliveryFee.controller.js';

const router = Router();

router.get('/estimate', requireAuth, getDeliveryFeeEstimate);

export default router;
