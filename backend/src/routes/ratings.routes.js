import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createRating, listRatings } from '../controllers/ratings.controller.js';

const router = Router();

router.get('/', requireAuth, listRatings);
router.post('/', requireAuth, createRating);

export default router;
