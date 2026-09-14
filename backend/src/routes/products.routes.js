import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  applyDiscount,
  approvePriceReview,
  createProduct,
  declinePriceReview,
  deleteProduct,
  getDeclinedPriceReviews,
  getHistoricalPriceAnalysis,
  getPendingPriceReviews,
  getProduct,
  listProducts,
  listPublicProducts,
  reactivatePriceReview,
  removeDiscount,
  setProductStatus,
  updateProduct,
} from '../controllers/products.controller.js';

const router = Router();

router.get('/price-reviews/pending', requireAuth, requireRole('admin'), getPendingPriceReviews);
router.get('/price-reviews/declined', requireAuth, requireRole('admin'), getDeclinedPriceReviews);
router.get('/public', listPublicProducts);
router.get('/historical-price', requireAuth, requireRole('farmer'), getHistoricalPriceAnalysis);

router.get('/', requireAuth, listProducts);
router.post('/', requireAuth, requireRole('farmer'), rateLimit({ name: 'product-create', limit: 30, windowMs: 60 * 1000, key: (req) => req.profile.id }), createProduct);
router.get('/:id', requireAuth, getProduct);
router.patch('/:id', requireAuth, requireRole('farmer'), rateLimit({ name: 'product-update', limit: 60, windowMs: 60 * 1000, key: (req) => req.profile.id }), updateProduct);
router.delete('/:id', requireAuth, requireRole('farmer'), rateLimit({ name: 'product-delete', limit: 30, windowMs: 60 * 1000, key: (req) => req.profile.id }), deleteProduct);
router.patch('/:id/status', requireAuth, requireRole('farmer'), setProductStatus);
router.post('/:id/discount', requireAuth, requireRole('farmer'), applyDiscount);
router.delete('/:id/discount', requireAuth, requireRole('farmer'), removeDiscount);
router.post('/:id/price-review/approve', requireAuth, requireRole('admin'), approvePriceReview);
router.post('/:id/price-review/decline', requireAuth, requireRole('admin'), declinePriceReview);
router.post('/:id/price-review/reactivate', requireAuth, requireRole('admin'), reactivatePriceReview);

export default router;
