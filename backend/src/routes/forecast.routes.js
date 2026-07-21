import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getDemandForecast } from '../controllers/forecast.controller.js';

const router = Router();

router.get('/demand', requireAuth, getDemandForecast);

export default router;
