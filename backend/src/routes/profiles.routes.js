import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { getAdminUserDetails } from '../lib/adminUserQueries.js';
import {
  acknowledgeMyVerification,
  createProfile,
  getAllVerifiedFarmers,
  getNearbyMapProfiles,
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
router.get('/nearby-map', requireAuth, getNearbyMapProfiles);
router.get('/', requireAuth, listProfiles);


router.get('/top-farmers', getTopRatedFarmers);

router.get('/farmers', getAllVerifiedFarmers);


router.get('/:id/public', getPublicFarmerProfile);
router.get('/:id/admin-details', requireAuth, requireRole('admin'), getAdminUserDetails);
router.get('/:id/verification-documents', requireAuth, requireRole('admin'), getVerificationDocuments);
router.patch('/:id/verification', requireAuth, requireRole('admin'), setVerification);
router.patch('/:id/account-status', requireAuth, requireRole('admin'), setAccountStatus);
router.get('/:id', requireAuth, getProfileById);

export default router;
