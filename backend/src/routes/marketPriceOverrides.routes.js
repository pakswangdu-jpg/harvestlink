import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  clearOverride, getOverrideHistory, listOverrides, setOverride,
} from '../controllers/marketPriceOverrides.controller.js';

const router = Router();

// Any signed-in role can read (every role's PSA price lookup needs to see current
// overrides) — only admin can write.
router.get('/', requireAuth, listOverrides);
router.get('/:commodityId/history', requireAuth, getOverrideHistory);
router.patch('/:commodityId', requireAuth, requireRole('admin'), setOverride);
router.delete('/:commodityId', requireAuth, requireRole('admin'), clearOverride);

export default router;
