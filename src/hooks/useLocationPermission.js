import { useEffect, useRef, useState } from 'react';
import { createLocationPermissionController } from '../services/locationPermissionService';

export function useLocationPermission(enabled) {
  const [state, setState] = useState({ permission: 'checking', requesting: false, error: '' });
  const controllerRef = useRef(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let autoRequested = false;
    const controller = createLocationPermissionController({
      browserNavigator: navigator,
      secureContext: window.isSecureContext !== false,
      onChange: (next) => {
        if (next.permission === 'prompt' && !autoRequested && !next.requesting && !next.error) {
          autoRequested = true;
          controller.request();
        }
        setState(next);
      },
    });
    controllerRef.current = controller;
    const refresh = () => { void controller.refresh(); };
    const handleVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      controller.destroy();
      controllerRef.current = null;
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled]);
  return {
    ...state,
    rawPermission: state.permission,
    permission: state.permission === 'prompt' || state.permission === 'checking' ? 'granted' : state.permission,
    requestPermission: () => controllerRef.current?.request(),
  };
}
