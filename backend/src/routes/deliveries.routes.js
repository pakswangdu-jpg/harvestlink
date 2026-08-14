import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  bookDelivery, getDelivery, updateDelivery, updateDeliveryStatus,
} from '../controllers/deliveries.controller.js';

const router = Router();

router.get('/:orderId', requireAuth, getDelivery);
router.post('/', requireAuth, bookDelivery);
router.patch('/:orderId', requireAuth, updateDelivery);
router.patch('/:orderId/status', requireAuth, updateDeliveryStatus);

export default router;
