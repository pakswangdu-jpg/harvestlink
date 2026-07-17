import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getSocket } from '../lib/socketClient';

// Joins the Socket.IO room for one order (see backend/src/realtime/orderTracking.js) and
// exposes whatever live GPS fix arrives over it, plus a connection status for the "GPS
// accuracy / connection status" indicator on the tracking UI. Purely additive — this is a
// new, faster broadcast layer alongside the existing REST-poll/Supabase-Realtime path
// already used by OrderTracking.jsx, not a replacement for it.
export function useOrderTrackingSocket(orderId) {
  const [livePosition, setLivePosition] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const joinedOrderIdRef = useRef(null);

  useEffect(() => {
    if (!orderId) return undefined;
    const socket = getSocket();
    let cancelled = false;

    const join = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.access_token) return;
      socket.emit('join-order', { orderId, token: session.access_token }, (response) => {
        if (cancelled) return;
        if (response?.ok) {
          joinedOrderIdRef.current = orderId;
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('error');
        }
      });
    };

    const handleLocationUpdate = (payload) => {
      // The shared socket may still be a member of a previously-joined order's room for a
      // moment during navigation — only accept updates that actually match this hook's order.
      if (payload?.orderId !== orderId) return;
      setLivePosition({ lat: payload.lat, lng: payload.lng, accuracy: payload.accuracy, locationUpdatedAt: payload.locationUpdatedAt });
    };
    const handleConnect = () => {
      setConnectionStatus('connecting');
      join();
    };
    const handleDisconnect = () => setConnectionStatus('disconnected');

    socket.on('location-update', handleLocationUpdate);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', () => setConnectionStatus('error'));

    if (socket.connected) join();

    return () => {
      cancelled = true;
      socket.off('location-update', handleLocationUpdate);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [orderId]);

  return { livePosition, connectionStatus };
}
