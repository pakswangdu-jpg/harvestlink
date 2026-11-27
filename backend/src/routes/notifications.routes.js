import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  deleteNotification,
  getMyPushSubscriptions,
  getPushConfig,
  listMyNotifications,
  markAllRead,
  markRead,
  sendTestPush,
  subscribePush,
  unsubscribePush,
} from '../controllers/notifications.controller.js';

const router = Router();

router.get('/', requireAuth, listMyNotifications);
router.get('/push/config', requireAuth, getPushConfig);
router.get('/push/subscriptions', requireAuth, getMyPushSubscriptions);
router.post('/push/subscribe', requireAuth, subscribePush);
router.post('/push/unsubscribe', requireAuth, unsubscribePush);
router.post('/push/test', requireAuth, sendTestPush);
router.patch('/read-all', requireAuth, markAllRead);
router.patch('/:id/read', requireAuth, markRead);
router.delete('/:id', requireAuth, deleteNotification);

export default router;
