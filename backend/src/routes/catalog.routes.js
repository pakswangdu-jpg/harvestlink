import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  createCategory, createUnit, deleteCategory, deleteUnit, getCatalogHandler, updateCategory, updateUnit,
} from '../controllers/catalog.controller.js';

const router = Router();
const admin = [requireAuth, requireRole('admin')];

router.get('/', requireAuth, getCatalogHandler);

router.post('/categories', ...admin, createCategory);
router.patch('/categories/:categoryId', ...admin, updateCategory);
router.delete('/categories/:categoryId', ...admin, deleteCategory);

router.post('/units', ...admin, createUnit);
router.patch('/units/:unitId', ...admin, updateUnit);
router.delete('/units/:unitId', ...admin, deleteUnit);

export default router;
