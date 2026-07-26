import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  deleteMessage,
  editMessage,
  listDirectThreads,
  listMessages,
  markDirectThreadRead,
  sendMessage,
} from '../controllers/messages.controller.js';

const router = Router();

router.get('/', requireAuth, listMessages);
router.get('/direct-threads', requireAuth, listDirectThreads);
router.post('/', requireAuth, sendMessage);
router.patch('/direct/:otherUserId/read', requireAuth, markDirectThreadRead);
router.patch('/message/:messageId', requireAuth, editMessage);
router.delete('/message/:messageId', requireAuth, deleteMessage);

export default router;
