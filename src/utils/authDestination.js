import { ROLE_DASHBOARDS } from './constants';

export const ADMIN_ENTRY_PATH = '/harvestlinkadmin';

export function getAuthDestination(role, { adminPortal = false, from } = {}) {
  if (adminPortal) return ADMIN_ENTRY_PATH;
  if (role === 'admin') return null;
  return from || ROLE_DASHBOARDS[role] || '/';
}
