/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { apiClient } from '../../services/apiClient';
import {
  acknowledgeVerification as acknowledgeVerificationRecord,
  loginUser,
  registerUser,
  resendRegistrationOtp,
  verifyRegistrationOtp,
} from '../../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUserState] = useState(null);
  const [loading, setLoading] = useState(true);

  const hydrateProfile = async () => {
    try {
      const profile = await apiClient.get('/profiles/me');
      setCurrentUserState(profile);
    } catch (error) {



      if (error.status === 401 || error.status === 403) {
        await supabase.auth.signOut();
        setCurrentUserState(null);
        return;
      }
      console.error('Unable to refresh the current profile:', error);
    }
  };
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session) await hydrateProfile();
      } catch (error) {


        console.error('Unable to restore the saved session:', error);
        if (!cancelled) setCurrentUserState(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
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
      const result = await registerUser(values);



      if (result.pendingVerification) return result;
      setCurrentUserState(result);
      return result;
    },
    async verifyOtp(email, token, password, pendingFiles) {
      const user = await verifyRegistrationOtp(email, token, password, pendingFiles);
      setCurrentUserState(user);
      return user;
    },
    async resendOtp(email) {
      await resendRegistrationOtp(email);
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
