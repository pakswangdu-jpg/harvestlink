/* eslint-disable react-refresh/only-export-components */
import {
  createContext, useCallback, useContext, useRef, useState,
} from 'react';
import ToastStack from '../components/common/ToastStack';

const ToastContext = createContext(null);

// How long a toast stays before auto-dismissing — long enough to read a short sentence,
// short enough not to pile up if a buyer adds several items in a row.
const TOAST_DURATION_MS = 3200;

let nextId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  // Keyed by toast id — lets dismissToast clear a still-pending auto-dismiss timer when a
  // toast is closed early (manually or by a fresh navigation), so it can never fire a
  // setState after the toast it belongs to is already gone.
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
