import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  createDonation,
  createDonationClaim,
  getDonation,
  listDonations,
  transitionDonationClaim,
  updateDonation,
} from '../controllers/donations.controller.js';

const router = Router();
router.use(requireAuth, requireRole('farmer', 'stakeholder', 'admin'));
router.get('/', listDonations);
router.get('/:id', getDonation);
const writeLimit = rateLimit({ name: 'donations-write', limit: 30, windowMs: 60000, key: (req) => req.profile.id });
router.post('/', requireRole('farmer'), writeLimit, createDonation);
router.post('/:id/claims', requireRole('stakeholder'), writeLimit, createDonationClaim);
router.post('/claims/:claimId/:action', writeLimit, transitionDonationClaim);
for (const action of ['request', 'receive', 'rate']) {
  router.post(`/:id/${action}`, requireRole('stakeholder'), writeLimit, (req, res, next) => {
    req.params.action = action;
    return updateDonation(req, res, next);
  });
}
for (const action of ['schedule', 'decline', 'cancel']) {
  router.post(`/:id/${action}`, requireRole('farmer'), writeLimit, (req, res, next) => {
    req.params.action = action;
    return updateDonation(req, res, next);
  });
}
export default router;
