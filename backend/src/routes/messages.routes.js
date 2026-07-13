import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { listMessages, markThreadRead, sendMessage } from '../controllers/messages.controller.js';

const router = Router();

router.get('/', requireAuth, listMessages);
router.post('/', requireAuth, sendMessage);
router.patch('/:orderId/read', requireAuth, markThreadRead);

export default router;
