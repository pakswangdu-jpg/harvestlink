import { Router } from 'express';
import { verifyLalamoveWebhook } from '../middleware/verifyLalamoveWebhook.js';
import { handleLalamoveWebhook } from '../controllers/webhooks/lalamoveWebhook.controller.js';

const router = Router();



router.post('/lalamove', verifyLalamoveWebhook, handleLalamoveWebhook);

export default router;
