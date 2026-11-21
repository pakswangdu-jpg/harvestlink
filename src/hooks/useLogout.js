import { useRef, useState } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { useToast } from '../contexts/ToastContext';

export const LOGOUT_NOTICE_KEY = 'harvestlink:logout-notice';

export function useLogout() {
  const { currentUser, logout } = useAuth();
  const { showToast } = useToast();
  const pendingRef = useRef(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleLogout = () => {
    if (!pendingRef.current) setIsConfirmOpen(true);
  };

  const cancelLogout = () => {
    if (!pendingRef.current) setIsConfirmOpen(false);
  };

  const confirmLogout = async () => {
    if (!isConfirmOpen || pendingRef.current) return;
    pendingRef.current = true;
    setIsLoggingOut(true);
    const isAdmin = currentUser?.role === 'admin';
    try {
      await logout();
      window.sessionStorage?.setItem(LOGOUT_NOTICE_KEY, isAdmin ? 'admin' : '1');
      window.location.assign(isAdmin ? '/admin' : '/');
    } catch {
      pendingRef.current = false;
      setIsLoggingOut(false);
      showToast({ type: 'error', message: 'Unable to log out. Please check your connection and try again.' });
    }
  };

  return { handleLogout, isLoggingOut, isConfirmOpen, confirmLogout, cancelLogout };
}
