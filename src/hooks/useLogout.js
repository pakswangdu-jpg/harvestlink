import { useRef, useState } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import { useToast } from '../contexts/ToastContext';

export function useLogout() {
  const { logout } = useAuth();
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
    try {
      await logout();
      window.location.assign('/');
    } catch {
      pendingRef.current = false;
      setIsLoggingOut(false);
      showToast({ type: 'error', message: 'Unable to log out. Please check your connection and try again.' });
    }
  };

  return { handleLogout, isLoggingOut, isConfirmOpen, confirmLogout, cancelLogout };
}
