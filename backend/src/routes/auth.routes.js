import { Router } from 'express';
import { checkContactNumber, register } from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', register);
router.get('/check-contact-number', checkContactNumber);

export default router;
