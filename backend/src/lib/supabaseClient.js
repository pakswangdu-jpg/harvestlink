import { createClient } from '@supabase/supabase-js';
import { createResilientFetch } from './resilientFetch.js';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set — see backend/.env.example.');
}

const supabaseFetch = createResilientFetch({
  retries: 2,
  retryDelayMs: 200,
  retryPostPathPatterns: [
    '/rest/v1/rpc/expire_donations',
    '/rest/v1/rpc/suspend_inactive_accounts',
  ],
});

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: supabaseFetch },
});
