import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getLalamoveQuote } from '../controllers/lalamove.controller.js';

const router = Router();

router.post('/quote', requireAuth, getLalamoveQuote);

export default router;
