import { ApiError } from '../lib/ApiError.js';






export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.profile?.role)) {
      return next(new ApiError('You do not have permission to perform this action.', 403));
    }
    next();
  };
}
