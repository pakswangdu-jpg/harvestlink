import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { deleteNotification, listMyNotifications, markAllRead, markRead } from '../controllers/notifications.controller.js';

const router = Router();

router.get('/', requireAuth, listMyNotifications);
router.patch('/read-all', requireAuth, markAllRead);
router.patch('/:id/read', requireAuth, markRead);
router.delete('/:id', requireAuth, deleteNotification);

export default router;
