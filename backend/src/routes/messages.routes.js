import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  listDirectThreads,
  listMessages,
  markDirectThreadRead,
  markThreadRead,
  sendMessage,
} from '../controllers/messages.controller.js';

const router = Router();

router.get('/', requireAuth, listMessages);
router.get('/direct-threads', requireAuth, listDirectThreads);
router.post('/', requireAuth, sendMessage);
router.patch('/direct/:otherUserId/read', requireAuth, markDirectThreadRead);
router.patch('/:orderId/read', requireAuth, markThreadRead);

export default router;
