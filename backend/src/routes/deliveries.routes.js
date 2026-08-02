import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { bookDelivery, getDelivery } from '../controllers/deliveries.controller.js';

const router = Router();

router.get('/:orderId', requireAuth, getDelivery);
router.post('/', requireAuth, bookDelivery);

export default router;
