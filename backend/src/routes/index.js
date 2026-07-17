import { Router } from 'express';
import authRoutes from './auth.routes.js';
import profilesRoutes from './profiles.routes.js';
import productsRoutes from './products.routes.js';
import ordersRoutes from './orders.routes.js';
import notificationsRoutes from './notifications.routes.js';
import messagesRoutes from './messages.routes.js';
import ratingsRoutes from './ratings.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/profiles', profilesRoutes);
router.use('/products', productsRoutes);
router.use('/orders', ordersRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/messages', messagesRoutes);
router.use('/ratings', ratingsRoutes);

export default router;
