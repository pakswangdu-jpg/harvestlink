import { Router } from 'express';
import { checkContactNumber, register, verifyRegistrationCode, resendRegistrationCode } from '../controllers/auth.controller.js';

const router = Router();

router.post('/register', register);
router.post('/verify-registration-code', verifyRegistrationCode);
router.post('/resend-registration-code', resendRegistrationCode);
router.get('/check-contact-number', checkContactNumber);

export default router;
