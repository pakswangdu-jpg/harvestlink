import { ApiError } from '../lib/ApiError.js';
import { ADMIN_NETWORK_ERROR, getAdminClientIPv4, hasRenderPublicIngress, parseAdminAllowedIps } from '../lib/adminNetwork.js';

export function createAdminNetworkGuard({ env = process.env, logger = console } = {}) {
  const config = parseAdminAllowedIps(env);
  if (!config.valid) logger.warn('Admin network security: ADMIN_ALLOWED_IPS is missing or invalid. Admin API access will be denied.');
  const proxyConfigured = env.RENDER !== 'true' || hasRenderPublicIngress(env) || Boolean(env.TRUSTED_PROXY_IPS?.trim());
  if (!proxyConfigured) logger.warn('Admin network security: no supported public ingress or verified proxy configuration. Admin API access will be denied.');
  return (req, res, next) => {
    if (req.profile?.role !== 'admin') return next();
    if (req.profile.account_status !== 'active') return next(new ApiError('This admin account is not active.', 403));
    const address = getAdminClientIPv4(req, env);
    if (config.valid && proxyConfigured && address && config.allowed.has(address)) return next();
    logger.warn(JSON.stringify({ timestamp: new Date().toISOString(), userId: req.profile.id, result: ADMIN_NETWORK_ERROR }));
    const error = new ApiError('Admin access is not allowed from this network.', 403);
    error.code = ADMIN_NETWORK_ERROR;
    return next(error);
  };
}

export const requireAdminNetwork = createAdminNetworkGuard();
