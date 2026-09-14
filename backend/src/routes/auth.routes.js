import { Router } from 'express';
import { checkContactNumber, register, verifyRegistrationCode, resendRegistrationCode } from '../controllers/auth.controller.js';
import { emailAndIpKey, rateLimit } from '../middleware/rateLimit.js';

const router = Router();

router.post('/register', rateLimit({ name: 'registration', limit: 5, windowMs: 60 * 60 * 1000 }), register);
router.post('/verify-registration-code', rateLimit({ name: 'verification', limit: 5, windowMs: 10 * 60 * 1000, key: emailAndIpKey }), verifyRegistrationCode);
router.post('/resend-registration-code', rateLimit({ name: 'verification-resend', limit: 3, windowMs: 15 * 60 * 1000, key: emailAndIpKey }), resendRegistrationCode);
router.get('/check-contact-number', checkContactNumber);

export default router;
