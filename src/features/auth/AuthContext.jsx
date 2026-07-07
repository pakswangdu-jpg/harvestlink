/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  acknowledgeVerification as acknowledgeVerificationRecord,
  clearCurrentUser,
  getCurrentUser,
  loginUser,
  refreshCurrentUser,
  registerUser,
} from '../../services/authService';
import { STORAGE_KEYS } from '../../utils/constants';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUserState] = useState(() => getCurrentUser());

  const value = useMemo(() => ({
    currentUser,
    login(email, password) {
      const user = loginUser(email, password);
      setCurrentUserState(user);
      return user;
    },
    register(values) {
      const user = registerUser(values);
      setCurrentUserState(user);
      return user;
    },
    logout() {
      clearCurrentUser();
      setCurrentUserState(null);
    },
    refreshUser() {
      setCurrentUserState(refreshCurrentUser());
    },
    acknowledgeVerification() {
      setCurrentUserState(acknowledgeVerificationRecord(currentUser.id));
    },
  }), [currentUser]);

  // Keeps this tab's session in sync with account changes made elsewhere (e.g. an
  // admin approving/rejecting verification in another tab) — the session snapshot
  // otherwise never updates after login.
  useEffect(() => {
    if (!currentUser || currentUser.role === 'admin') return undefined;
    const reload = () => setCurrentUserState(refreshCurrentUser());
    const handleStorage = (event) => {
      if (!event.key || event.key === STORAGE_KEYS.users) reload();
    };
    const interval = setInterval(reload, 4000);
    window.addEventListener('storage', handleStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.role]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
