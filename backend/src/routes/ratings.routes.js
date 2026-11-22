import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createRating, listMyDonationRatings, listRatings } from '../controllers/ratings.controller.js';

const router = Router();

router.get('/', requireAuth, listRatings);
router.get('/my-donations', requireAuth, listMyDonationRatings);
router.post('/', requireAuth, createRating);

export default router;
