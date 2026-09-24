import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const REMEMBER_SESSION_KEY = 'harvestlink:rememberSession';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set — see .env.example.');
}
const authStorage = {
  getItem(key) {
    const remember = window.localStorage.getItem(REMEMBER_SESSION_KEY);
    if (remember === 'false') return window.sessionStorage.getItem(key);
    return window.localStorage.getItem(key) || window.sessionStorage.getItem(key);
  },
  setItem(key, value) {
    const storage = window.localStorage.getItem(REMEMBER_SESSION_KEY) === 'true'
      ? window.localStorage
      : window.sessionStorage;
    storage.setItem(key, value);
  },
  removeItem(key) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export function setAuthPersistence(remember) {
  window.localStorage.setItem(REMEMBER_SESSION_KEY, String(remember));
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
