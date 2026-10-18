import { ROLE_DASHBOARDS } from './constants';

export const ADMIN_ENTRY_PATH = '/admin';

export function getAuthDestination(role, { adminPortal = false, from } = {}) {
  if (adminPortal) return role === 'admin' ? ADMIN_ENTRY_PATH : null;
  if (role === 'admin') return null;
  return from || ROLE_DASHBOARDS[role] || '/';
}
