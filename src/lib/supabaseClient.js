import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set — see .env.example.');
}

// Session storage is deliberately sessionStorage, not the default localStorage — the app
// has always let a farmer tab and a buyer tab stay logged in as different accounts side by
// side in the same browser (see the old src/services/storageService.js), and sessionStorage
// already implements the getItem/setItem/removeItem interface supabase-js expects, so this
// preserves that behavior with a one-line config change.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
