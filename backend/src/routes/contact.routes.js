import { Router } from 'express';
import { sendContactMessage } from '../controllers/contact.controller.js';
import { rateLimit } from '../middleware/rateLimit.js';

const router = Router();

router.post('/', rateLimit({ name: 'contact', limit: 5, windowMs: 15 * 60 * 1000 }), sendContactMessage);

export default router;
