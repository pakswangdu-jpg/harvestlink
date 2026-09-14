import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { getCropForecastDetail, getDemandForecast } from '../controllers/forecast.controller.js';

const router = Router();

router.get('/demand', requireAuth, rateLimit({ name: 'forecast', limit: 10, windowMs: 60 * 1000, key: (req) => req.profile.id }), getDemandForecast);
router.get('/demand/:cropName', requireAuth, rateLimit({ name: 'forecast', limit: 10, windowMs: 60 * 1000, key: (req) => req.profile.id }), getCropForecastDetail);

export default router;
