import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getCropForecastDetail, getDemandForecast } from '../controllers/forecast.controller.js';

const router = Router();

router.get('/demand', requireAuth, getDemandForecast);
router.get('/demand/:cropName', requireAuth, getCropForecastDetail);

export default router;
