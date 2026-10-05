import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getSocket } from '../lib/socketClient';
import { getLiveOrderPosition, publishLiveOrderPosition, subscribeLiveOrderPosition } from '../services/liveTrackingStore';
import { positionFromOrder } from '../utils/liveTrackingPosition';

export function useOrderTrackingSocket(orderId, order = null) {
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const subscribe = useCallback((listener) => subscribeLiveOrderPosition(orderId, listener), [orderId]);
  const getSnapshot = useCallback(() => getLiveOrderPosition(orderId), [orderId]);
  const livePosition = useSyncExternalStore(subscribe, getSnapshot, () => null);

  useEffect(() => {
    if (order?.id !== orderId) return;
    const position = positionFromOrder(order);
    if (position) publishLiveOrderPosition(orderId, position, { source: 'persisted' });
  }, [orderId, order]);

  useEffect(() => {
    if (!orderId) return undefined;
    const socket = getSocket();
    let cancelled = false;
    let joined = false;
    let joining = false;
    const join = async () => {
      if (cancelled || joined || joining || !socket.connected) return;
      joining = true;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled || !socket.connected || !session?.access_token) { joining = false; return; }
        socket.timeout(10000).emit('join-order', { orderId, token: session.access_token }, (error, response) => {
          joining = false;
          if (cancelled) return;
          joined = !error && Boolean(response?.ok) && socket.connected;
          setConnectionStatus(joined ? 'connected' : 'error');
          if (response?.ok && response.location?.orderId === orderId) {
            publishLiveOrderPosition(orderId, response.location, { serverNow: response.serverNow });
          }
        });
      } catch {
        joining = false;
        if (!cancelled) setConnectionStatus('error');
      }
    };
    const handleLocationUpdate = (payload) => {
      if (cancelled || payload?.orderId !== orderId) return;
      publishLiveOrderPosition(orderId, payload, { serverNow: payload.serverNow });
    };
    const handleConnect = () => { joined = false; joining = false; setConnectionStatus('connecting'); void join(); };
    const handleDisconnect = () => { joined = false; setConnectionStatus('disconnected'); };
    const handleError = () => setConnectionStatus('error');
    socket.on('location-update', handleLocationUpdate);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleError);
    if (socket.connected) void join();
    const retryTimer = setInterval(() => { void join(); }, 15000);
    return () => {
      cancelled = true;
      clearInterval(retryTimer);
      socket.off('location-update', handleLocationUpdate);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleError);
    };
  }, [orderId]);

  return { livePosition: livePosition || (order?.id === orderId ? positionFromOrder(order) : null), connectionStatus };
}
