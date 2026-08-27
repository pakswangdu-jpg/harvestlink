import { Router } from 'express';
import { verifyLalamoveWebhook } from '../middleware/verifyLalamoveWebhook.js';
import { handleLalamoveWebhook } from '../controllers/webhooks/lalamoveWebhook.controller.js';

const router = Router();

// No requireAuth — this is called by Lalamove's own servers, not a signed-in HarvestLink
// user. verifyLalamoveWebhook checks the request's HMAC signature instead (see that file).
router.post('/lalamove', verifyLalamoveWebhook, handleLalamoveWebhook);

export default router;
