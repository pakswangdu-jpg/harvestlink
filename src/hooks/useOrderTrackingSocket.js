import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getSocket } from '../lib/socketClient';






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


      if (payload?.orderId !== orderId) return;
      setLivePosition({
        lat: payload.lat,
        lng: payload.lng,
        accuracy: payload.accuracy,
        heading: payload.heading,
        deviceHeading: payload.heading,
        speed: payload.speed,
        locationUpdatedAt: payload.locationUpdatedAt,
      });
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
