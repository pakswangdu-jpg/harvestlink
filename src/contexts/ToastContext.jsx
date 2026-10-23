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

  const showToast = useCallback(({ type = 'success', title, message }) => {
    nextId += 1;
    const id = nextId;
    setToasts((previous) => [...previous, { id, type, title, message }]);
    timers.current[id] = setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
    return id;
  }, [dismissToast]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(LOGOUT_NOTICE_KEY) !== '1') return;
      sessionStorage.removeItem(LOGOUT_NOTICE_KEY);
      showToast({
        type: 'success',
        title: 'Signed out',
        message: 'You have been safely signed out of HarvestLink.',
      });
    } catch {
      // Storage can be unavailable in restricted browser sessions.
    }
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
