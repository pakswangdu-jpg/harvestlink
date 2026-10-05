import { useEffect, useRef, useState } from 'react';
import { fetchTrafficRoutes } from '../services/googleDirectionsService';
import { createTrafficNavigator } from '../services/trafficNavigation';

export function useTrafficNavigation({ orderId, origin, destination, position, locationUpdatedAt, active, enabled = true }) {
  const controller = useRef(null);
  const [result, setResult] = useState(null);
  useEffect(() => {
    const navigator = createTrafficNavigator({ fetchRoutes: fetchTrafficRoutes, onChange: (state) => setResult({ ...state, orderId }) });
    controller.current = navigator;
    const timer = setInterval(() => { if (document.visibilityState !== 'hidden') navigator.tick(); }, 10000);
    return () => { clearInterval(timer); navigator.destroy(); };
  }, [orderId]);
  useEffect(() => {
    controller.current?.update({ origin, destination, position, locationUpdatedAt, active, enabled });
  }, [orderId, origin, destination, position, locationUpdatedAt, active, enabled]);
  const state = result?.orderId === orderId ? result : {};
  return {
    ...state,
    chooseAlternative: () => controller.current?.chooseAlternative(),
    keepCurrent: () => controller.current?.keepCurrent(),
  };
}
