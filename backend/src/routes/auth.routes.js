import { Router } from 'express';
import { checkContactNumber, register, verifyRegistrationCode, resendRegistrationCode } from '../controllers/auth.controller.js';
import { emailAndIpKey, rateLimit } from '../middleware/rateLimit.js';
import { requestPasswordReset } from '../controllers/passwordRecovery.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { requireAdminEntryNetwork } from '../middleware/requireAdminNetwork.js';
import { login, adminLogin } from '../controllers/login.controller.js';

const router = Router();
const requireAdminRole = requireRole('admin');
const loginRateLimit = rateLimit({ name: 'login', limit: 8, windowMs: 15 * 60 * 1000, key: emailAndIpKey });
router.get('/admin-entry-access', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
}, requireAdminEntryNetwork, (req, res, next) => {
  if (!req.headers.authorization) return next();
  // A saved marketplace session cannot use the signed-out entry as a role bypass.
  return requireAuth(req, res, (error) => error ? next(error) : requireAdminRole(req, res, next));
}, (req, res) => res.json({ allowed: true }));
router.get('/admin-access', requireAuth, requireRole('admin'), (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ allowed: true });
});

router.post('/login', loginRateLimit, login);
router.post('/admin-login', loginRateLimit, requireAdminEntryNetwork, adminLogin);
router.post('/register', rateLimit({ name: 'registration', limit: 5, windowMs: 60 * 60 * 1000 }), register);
router.post('/verify-registration-code', rateLimit({ name: 'verification', limit: 5, windowMs: 10 * 60 * 1000, key: emailAndIpKey }), verifyRegistrationCode);
router.post('/resend-registration-code', rateLimit({ name: 'verification-resend', limit: 3, windowMs: 15 * 60 * 1000, key: emailAndIpKey }), resendRegistrationCode);
router.get('/check-contact-number', checkContactNumber);
router.post('/request-password-reset',
  rateLimit({ name: 'password-reset', limit: 10, windowMs: 15 * 60 * 1000 }),
  rateLimit({ name: 'password-reset-email', limit: 3, windowMs: 15 * 60 * 1000, key: emailAndIpKey }),
  requestPasswordReset);

export default router;
