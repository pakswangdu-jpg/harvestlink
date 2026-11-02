import { supabaseAdmin } from './supabaseClient.js';

const MISSING_MIGRATION_CODES = new Set(['42P01', '42883', 'PGRST202', 'PGRST205']);

export async function expireDonations() {
  if (typeof supabaseAdmin.rpc !== 'function') return 0;
  const { data, error } = await supabaseAdmin.rpc('expire_donations');
  if (error) {
    if (MISSING_MIGRATION_CODES.has(error.code)) return 0;
    throw error;
  }
  return Number(data || 0);
}

export function startDonationExpiryJob({ run = expireDonations, intervalMs = 60_000, logger = console } = {}) {
  let migrationWarningShown = false;
  const tick = async () => {
    try {
      await run();
    } catch (error) {
      if (!migrationWarningShown && MISSING_MIGRATION_CODES.has(error?.code)) {
        migrationWarningShown = true;
        logger.warn('Donation expiration job is waiting for the inventory/donations migration.');
      } else if (!MISSING_MIGRATION_CODES.has(error?.code)) {
        logger.error('Donation expiration job failed:', error);
      }
    }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, intervalMs);
  return () => clearInterval(timer);
}
