import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { listMyNotifications, markAllRead, markRead } from '../controllers/notifications.controller.js';

const router = Router();

router.get('/', requireAuth, listMyNotifications);
router.patch('/read-all', requireAuth, markAllRead);
router.patch('/:id/read', requireAuth, markRead);

export default router;
