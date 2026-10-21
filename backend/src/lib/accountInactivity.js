import { supabaseAdmin } from './supabaseClient.js';
import { ApiError } from './ApiError.js';

const INACTIVITY_ROLES = new Set(['buyer', 'farmer', 'stakeholder']);
const PREFLIGHT_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export function shouldCheckAccountInactivity(profile, now = Date.now()) {
  if (profile.account_status !== 'active' || !INACTIVITY_ROLES.has(profile.role)) return false;
  const anchor = profile.last_active_at || profile.created_at;
  const anchorTime = anchor ? new Date(anchor).getTime() : NaN;
  // Only a cheap preflight: Postgres decides the exact six-calendar-month boundary.
  return Number.isFinite(anchorTime) && now - anchorTime >= PREFLIGHT_AGE_MS;
}

export async function suspendInactiveAccounts(userId = null) {
  const { data, error } = await supabaseAdmin.rpc('suspend_inactive_accounts', { p_user: userId });
  if (error) {
    const missingMigration = ['PGRST202', 'PGRST205', '42883', '42703', '42P01'].includes(error.code);
    throw new ApiError(missingMigration
      ? 'Account inactivity protection is not configured. Apply the inactive-account migration.'
      : 'Unable to check account inactivity. Please try again.', 503);
  }
  if (!Array.isArray(data) || !data.every((row) => typeof row?.user_id === 'string' && row.user_id)) {
    throw new ApiError('Unable to check account inactivity. Please try again.', 503);
  }
  return data.map((row) => row.user_id);
}

export async function assertAccountActive(profile) {
  if (profile.account_status === 'suspended') {
    const error = new ApiError(profile.inactivity_suspended_at
      ? 'This account was suspended after six months of inactivity. Contact Admin to reactivate it.'
      : 'This account has been suspended. Contact support for assistance.', 403);
    error.code = 'ACCOUNT_SUSPENDED';
    throw error;
  }
  if (shouldCheckAccountInactivity(profile)) {
    const suspended = await suspendInactiveAccounts(profile.id);
    if (suspended.includes(profile.id)) {
      throw new ApiError('This account was suspended after six months of inactivity. Contact Admin to reactivate it.', 403);
    }
  }
}

export function startInactivitySuspensionJob({
  onSuspended = () => {}, run = suspendInactiveAccounts, intervalMs = SWEEP_INTERVAL_MS, logger = console,
} = {}) {
  let running = false;
  let stopped = false;
  const sweep = async () => {
    if (running || stopped) return;
    running = true;
    try {
      for (let batch = 0; batch < 20 && !stopped; batch += 1) {
        const ids = await run();
        ids.forEach(onSuspended);
        if (ids.length < 500) break;
      }
    } catch (error) {
      logger.error('Inactive-account suspension check failed:', error.message);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => { void sweep(); }, intervalMs);
  timer.unref?.();
  void sweep();
  return () => { stopped = true; clearInterval(timer); };
}
