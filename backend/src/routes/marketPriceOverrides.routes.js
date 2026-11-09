import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  clearOverride, getOverrideHistory, getRecommendation, listOverrides, setOverride,
} from '../controllers/marketPriceOverrides.controller.js';

const router = Router();



router.get('/', requireAuth, listOverrides);
router.post('/:commodityId/recommendation', requireAuth, getRecommendation);
router.get('/:commodityId/history', requireAuth, getOverrideHistory);
router.patch('/:commodityId', requireAuth, requireRole('admin'), setOverride);
router.delete('/:commodityId', requireAuth, requireRole('admin'), clearOverride);

export default router;
