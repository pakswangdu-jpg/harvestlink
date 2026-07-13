import { ApiError } from '../lib/ApiError.js';

// Role gate factory — used after requireAuth, e.g. router.patch('/:id/verification',
// requireAuth, requireRole('admin'), controller). Resource-level OWNERSHIP checks
// (e.g. "is this farmer the owner of this specific product?") are NOT handled here —
// they're done inline in each controller, since what "ownership" means differs per
// resource and can't be expressed as a static list of allowed roles.
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.profile?.role)) {
      return next(new ApiError('You do not have permission to perform this action.', 403));
    }
    next();
  };
}
