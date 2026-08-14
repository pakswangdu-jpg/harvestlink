import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socketClient';

// Two tiers of "nothing's come through in a while" fallback, only ever used when no explicit
// signal has said otherwise — a short grace period surfaces "Reconnecting" quickly, a longer
// one escalates to a firm "Offline" if still nothing. This is a safety net, not the primary
// path: the primary path is the explicit 'sharer-status' broadcast (see
// useFarmerActiveDeliverySharing.js and the backend's own disconnect handler in
// backend/src/realtime/orderTracking.js, which fires this even if the sharer's device never
// gets the chance to report "offline" itself — e.g. its battery dies mid-trip).
const RECONNECTING_AFTER_MS = 10000;
const OFFLINE_AFTER_MS = 25000;
const STALENESS_CHECK_INTERVAL_MS = 4000;

// Tracks one order's live sharer-connection status — 'online' | 'offline' | 'reconnecting' |
// 'gps-lost' | null (unknown — nothing's arrived yet) — for LiveDeliveryMap.jsx's status
// badge. `lastUpdateAt` (the order's own locationUpdatedAt, kept fresh independently via
// Supabase Realtime/REST polling in OrderTracking.jsx) counts as an "still alive" signal too,
// not just the socket's own 'location-update'/'sharer-status' events — so a viewer whose own
// socket connection is degraded can still see an accurate status through that separate path,
// the same dual-path resilience the rest of this order-tracking stack already relies on.
export function useOrderConnectionStatus(orderId, { active, lastUpdateAt } = {}) {
  const [status, setStatus] = useState(null);
  const lastSignalAtRef = useRef(null);

  useEffect(() => {
    if (!active || !orderId) return undefined;
    // Fresh subscription period (either just became active, or switched to a different order)
    // — no stale signal timestamp carried over from a previous one.
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

    // Only ever downgrades — never invents an "online" claim on its own, so a viewer never
    // sees a falsely-healthy status just because the timer happened to tick.
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

  // Ignores whatever `status` holds from a previous active period rather than clearing it
  // synchronously in the effect above (which would trigger an extra cascading render for no
  // benefit — nothing renders that stale value in between anyway, since this return is what
  // every consumer actually reads).
  return active && orderId ? status : null;
}
