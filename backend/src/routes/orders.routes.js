import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  advanceDelivery,
  cancelOrder,
  createOrder,
  getOrder,
  listOrders,
  payOrder,
  updateOrderStatus,
} from '../controllers/orders.controller.js';

const router = Router();

router.get('/', requireAuth, listOrders);
router.post('/', requireAuth, createOrder);
router.get('/:id', requireAuth, getOrder);
router.patch('/:id/status', requireAuth, updateOrderStatus);
router.patch('/:id/cancel', requireAuth, cancelOrder);
router.patch('/:id/advance-delivery', requireAuth, advanceDelivery);
router.patch('/:id/pay', requireAuth, payOrder);

export default router;
