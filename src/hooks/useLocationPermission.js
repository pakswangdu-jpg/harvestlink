import { useEffect, useRef, useState } from 'react';
import { createLocationPermissionController } from '../services/locationPermissionService';

export function useLocationPermission(enabled) {
  const [state, setState] = useState({ permission: 'checking', requesting: false, error: '' });
  const controllerRef = useRef(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = createLocationPermissionController({
      browserNavigator: navigator, secureContext: window.isSecureContext !== false, onChange: setState,
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
  return { ...state, requestPermission: () => controllerRef.current?.request() };
}
