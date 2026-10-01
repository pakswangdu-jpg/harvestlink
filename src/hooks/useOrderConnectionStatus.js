import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socketClient';








const RECONNECTING_AFTER_MS = 10000;
const OFFLINE_AFTER_MS = 25000;
const STALENESS_CHECK_INTERVAL_MS = 4000;








export function useOrderConnectionStatus(orderId, { active, lastUpdateAt } = {}) {
  const [status, setStatus] = useState(null);
  const lastSignalAtRef = useRef(null);

  useEffect(() => {
    if (!active || !orderId) return undefined;


    lastSignalAtRef.current = null;

    const socket = getSocket();
    const applyExplicitStatus = (nextStatus) => {
      lastSignalAtRef.current = Date.now();
      setStatus(nextStatus);
    };
    const handleSharerStatus = (payload) => {
      if (payload?.orderId !== orderId) return;
      applyExplicitStatus(payload.status);
    };
    const handleLocationUpdate = (payload) => {
      if (payload?.orderId !== orderId) return;
      applyExplicitStatus('online');
    };
    socket.on('sharer-status', handleSharerStatus);
    socket.on('location-update', handleLocationUpdate);



    const interval = setInterval(() => {
      if (lastSignalAtRef.current == null) return;
      const idleMs = Date.now() - lastSignalAtRef.current;
      setStatus((current) => {
        if (current === 'offline') return current;
        if (idleMs >= OFFLINE_AFTER_MS) return 'offline';
        if (idleMs >= RECONNECTING_AFTER_MS && current === 'online') return 'reconnecting';
        return current;
      });
    }, STALENESS_CHECK_INTERVAL_MS);

    return () => {
      socket.off('sharer-status', handleSharerStatus);
      socket.off('location-update', handleLocationUpdate);
      clearInterval(interval);
    };
  }, [orderId, active]);

  useEffect(() => {
    if (!active || !lastUpdateAt) return;
    const ts = new Date(lastUpdateAt).getTime();
    if (!Number.isFinite(ts) || (lastSignalAtRef.current != null && ts <= lastSignalAtRef.current)) return;
    lastSignalAtRef.current = ts;
    setStatus((current) => (current == null || current === 'offline' || current === 'reconnecting' ? 'online' : current));
  }, [active, lastUpdateAt]);





  return active && orderId ? status : null;
}
