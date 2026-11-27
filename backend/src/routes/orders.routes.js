import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  advanceDelivery,
  advanceWholesaleDelivery,
  arrangeWholesaleDelivery,
  cancelOrder,
  confirmWholesaleDelivery,
  createOrder,
  getOrder,
  getOrderTrackingProfiles,
  getOrderReceipt,
  getCheckoutQuote,
  listOrders,
  manageLalamoveDeliveryQuote,
  updateOrderLocation,
  updateOrderStatus,
} from '../controllers/orders.controller.js';

const router = Router();

router.get('/', requireAuth, listOrders);
router.post('/', requireAuth, createOrder);
router.post('/quote', requireAuth, getCheckoutQuote);
router.get('/:id', requireAuth, getOrder);
router.get('/:id/tracking-profiles', requireAuth, getOrderTrackingProfiles);
router.get('/:id/receipt', requireAuth, getOrderReceipt);
router.patch('/:id/status', requireAuth, updateOrderStatus);
router.patch('/:id/lalamove-delivery-quote', requireAuth, manageLalamoveDeliveryQuote);
router.patch('/:id/wholesale-arrangement', requireAuth, arrangeWholesaleDelivery);
router.patch('/:id/wholesale-confirm', requireAuth, confirmWholesaleDelivery);
router.patch('/:id/wholesale-status', requireAuth, advanceWholesaleDelivery);
router.patch('/:id/cancel', requireAuth, cancelOrder);
router.patch('/:id/advance-delivery', requireAuth, advanceDelivery);
router.patch('/:id/location', requireAuth, updateOrderLocation);

export default router;
