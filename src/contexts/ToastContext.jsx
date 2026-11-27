/* eslint-disable react-refresh/only-export-components */
import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import ToastStack from '../components/common/ToastStack';

const LOGOUT_NOTICE_KEY = 'harvestlink:logout-notice';

const ToastContext = createContext(null);



const TOAST_DURATION_MS = 3200;

let nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);



  const timers = useRef({});

  const dismissToast = useCallback((id) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const showToast = useCallback(({ type = 'success', title, message, actionLabel, onAction, duration = TOAST_DURATION_MS, centered = false }) => {
    nextId += 1;
    const id = nextId;
    setToasts((previous) => [...previous, { id, type, title, message, actionLabel, onAction, centered }]);
    timers.current[id] = setTimeout(() => dismissToast(id), duration);
    return id;
  }, [dismissToast]);

  useEffect(() => {
    let timeoutId;
    try {
      const notice = sessionStorage.getItem(LOGOUT_NOTICE_KEY);
      if (notice !== '1' && notice !== 'admin') return;
      sessionStorage.removeItem(LOGOUT_NOTICE_KEY);
      const isAdmin = notice === 'admin';
      timeoutId = window.setTimeout(() => {
        showToast({
          type: 'success',
          title: isAdmin ? 'Signed out as administrator' : 'Signed out',
          message: isAdmin
            ? 'You have been safely signed out of the HarvestLink Admin Portal.'
            : 'You have been safely signed out of HarvestLink.',
        });
      }, 0);
    } catch {
      // Storage can be unavailable in restricted browser sessions.
    }
    return () => window.clearTimeout(timeoutId);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider.');
  return context;
}

const NOOP_TOAST = { showToast: () => {} };

export function useOptionalToast() {
  return useContext(ToastContext) || NOOP_TOAST;
}
