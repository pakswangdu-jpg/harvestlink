import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  addProductUnit, createCategory, createProduct, createUnit,
  deleteCategory, deleteProduct, deleteUnit, getCatalogHandler,
  removeProductUnit, updateCategory, updateProduct, updateProductUnit, updateUnit,
} from '../controllers/catalog.controller.js';

const router = Router();
const admin = [requireAuth, requireRole('admin')];

router.get('/', requireAuth, getCatalogHandler);

router.post('/categories', ...admin, createCategory);
router.patch('/categories/:categoryId', ...admin, updateCategory);
router.delete('/categories/:categoryId', ...admin, deleteCategory);

router.post('/categories/:categoryId/products', ...admin, createProduct);
router.patch('/products/:productId', ...admin, updateProduct);
router.delete('/products/:productId', ...admin, deleteProduct);

router.post('/units', ...admin, createUnit);
router.patch('/units/:unitId', ...admin, updateUnit);
router.delete('/units/:unitId', ...admin, deleteUnit);

router.post('/products/:productId/units', ...admin, addProductUnit);
router.patch('/products/:productId/units/:unitId', ...admin, updateProductUnit);
router.delete('/products/:productId/units/:unitId', ...admin, removeProductUnit);

export default router;
