import { Router } from 'express';
import { checkContactNumber, register, verifyRegistrationCode, resendRegistrationCode } from '../controllers/auth.controller.js';
import { emailAndIpKey, rateLimit } from '../middleware/rateLimit.js';
import { requestPasswordReset } from '../controllers/passwordRecovery.controller.js';

const router = Router();

router.post('/register', rateLimit({ name: 'registration', limit: 5, windowMs: 60 * 60 * 1000 }), register);
router.post('/verify-registration-code', rateLimit({ name: 'verification', limit: 5, windowMs: 10 * 60 * 1000, key: emailAndIpKey }), verifyRegistrationCode);
router.post('/resend-registration-code', rateLimit({ name: 'verification-resend', limit: 3, windowMs: 15 * 60 * 1000, key: emailAndIpKey }), resendRegistrationCode);
router.get('/check-contact-number', checkContactNumber);
router.post('/request-password-reset',
  rateLimit({ name: 'password-reset', limit: 10, windowMs: 15 * 60 * 1000 }),
  rateLimit({ name: 'password-reset-email', limit: 3, windowMs: 15 * 60 * 1000, key: emailAndIpKey }),
  requestPasswordReset);

export default router;
