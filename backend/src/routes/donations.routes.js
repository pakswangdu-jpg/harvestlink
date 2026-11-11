import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  confirmDonationHandover,
  createDonation,
  createDonationClaim,
  getDonation,
  getDonationTrackingProfiles,
  listDonations,
  notifyFarmerOfDonationArrival,
  transitionDonationClaim,
  updateDonation,
  updateDonationPickupLocation,
} from '../controllers/donations.controller.js';

const router = Router();
router.use(requireAuth, requireRole('farmer', 'stakeholder', 'admin'));
router.get('/', listDonations);
router.get('/claims/:claimId/tracking-profiles', requireRole('farmer', 'stakeholder'), getDonationTrackingProfiles);
router.get('/:id/tracking-profiles', requireRole('farmer', 'stakeholder'), getDonationTrackingProfiles);
router.get('/:id', getDonation);

const writeLimit = rateLimit({ name: 'donations-write', limit: 30, windowMs: 60000, key: (req) => req.profile.id });
const locationLimit = rateLimit({ name: 'donations-location', limit: 240, windowMs: 60000, key: (req) => req.profile.id });

router.post('/', requireRole('farmer'), writeLimit, createDonation);
router.post('/:id/claims', requireRole('stakeholder'), writeLimit, createDonationClaim);
router.patch('/claims/:claimId/location', requireRole('stakeholder'), locationLimit, updateDonationPickupLocation);
router.patch('/:id/location', requireRole('stakeholder'), locationLimit, updateDonationPickupLocation);
router.post('/claims/:claimId/notify-arrival', requireRole('stakeholder'), writeLimit, notifyFarmerOfDonationArrival);
router.post('/:id/notify-arrival', requireRole('stakeholder'), writeLimit, notifyFarmerOfDonationArrival);
router.post('/claims/:claimId/confirm-handover', requireRole('farmer'), writeLimit, confirmDonationHandover);
router.post('/:id/confirm-handover', requireRole('farmer'), writeLimit, confirmDonationHandover);
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
