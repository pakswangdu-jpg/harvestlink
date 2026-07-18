import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import {
  acknowledgeMyVerification,
  createProfile,
  getMyProfile,
  getProfileById,
  getPublicFarmerProfile,
  getTopRatedFarmers,
  getVerificationDocuments,
  listProfiles,
  setAccountStatus,
  setVerification,
  updateMyProfile,
} from '../controllers/profiles.controller.js';

const router = Router();

router.post('/', requireAuth, createProfile);
router.get('/me', requireAuth, getMyProfile);
router.patch('/me', requireAuth, updateMyProfile);
router.post('/me/acknowledge-verification', requireAuth, acknowledgeMyVerification);
router.get('/', requireAuth, listProfiles);
// Public, no requireAuth — must stay above the /:id route below, or Express would match
// "top-farmers" as an :id instead of this handler.
router.get('/top-farmers', getTopRatedFarmers);
// Also public — an extra path segment past :id, so it doesn't collide with the
// requireAuth'd GET /:id below regardless of registration order.
router.get('/:id/public', getPublicFarmerProfile);
router.get('/:id/verification-documents', requireAuth, requireRole('admin'), getVerificationDocuments);
router.patch('/:id/verification', requireAuth, requireRole('admin'), setVerification);
router.patch('/:id/account-status', requireAuth, requireRole('admin'), setAccountStatus);
router.get('/:id', requireAuth, getProfileById);

export default router;
