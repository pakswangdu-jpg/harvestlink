/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { apiClient } from '../../services/apiClient';
import { acknowledgeVerification as acknowledgeVerificationRecord, loginUser, registerUser } from '../../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUserState] = useState(null);
  const [loading, setLoading] = useState(true);

  const hydrateProfile = async () => {
    try {
      const profile = await apiClient.get('/profiles/me');
      setCurrentUserState(profile);
    } catch {
      // Session exists but no profile (or the account is suspended) — treat as logged out.
      await supabase.auth.signOut();
      setCurrentUserState(null);
    }
  };

  // React.StrictMode (main.jsx) intentionally double-invokes effects in dev — mount,
  // clean up, mount again — to surface exactly this kind of bug. A shared ref-based
  // "skip if already running" guard here previously caused the SECOND (real) invocation
  // to no-op while the FIRST invocation's fetch was still in flight, so `loading` flipped
  // to false with `currentUser` still null. ProtectedRoute then briefly redirected to
  // /login, which immediately bounced an already-authenticated user to their role's
  // default dashboard (AuthPage's own "already logged in" redirect) instead of the
  // deep-linked page they actually requested — e.g. a hard refresh on /farmer-products
  // always landing back on /farmer-dashboard. Using a per-invocation `cancelled` flag
  // instead (the standard React pattern) fixes it: only the still-current invocation is
  // ever allowed to call setLoading(false), so a superseded run can't act on stale state.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) await hydrateProfile();
      if (!cancelled) setLoading(false);
    })();

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setCurrentUserState(null);
    });
    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({
    currentUser,
    loading,
    async login(email, password) {
      const user = await loginUser(email, password);
      setCurrentUserState(user);
      return user;
    },
    async register(values) {
      const user = await registerUser(values);
      setCurrentUserState(user);
      return user;
    },
    async logout() {
      await supabase.auth.signOut();
      setCurrentUserState(null);
    },
    async refreshUser() {
      await hydrateProfile();
    },
    async acknowledgeVerification() {
      const user = await acknowledgeVerificationRecord();
      setCurrentUserState(user);
    },
  }), [currentUser, loading]);

  // Keeps this tab's session in sync with account changes made elsewhere (e.g. an admin
  // approving/rejecting verification, or suspending the account) — a real network poll
  // now, not a synchronous localStorage read, so it runs less often than before.
  useEffect(() => {
    if (!currentUser || currentUser.role === 'admin') return undefined;
    const interval = setInterval(hydrateProfile, 20000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
