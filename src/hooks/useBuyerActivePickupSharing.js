import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getSocket } from '../lib/socketClient';
import { getOrdersByBuyer } from '../services/orderService';
import { haversineKm } from '../utils/geo';

const POLL_INTERVAL_MS = 6000;
// Same cadence as useFarmerActiveDeliverySharing.js — see that file for why.
const MIN_SEND_INTERVAL_MS = 4000;
const MIN_SEND_MOVE_KM = 0.01;

function isActivePickupOrder(order) {
  return order.status === 'confirmed' && order.deliveryStatus === 'ready_for_pickup' && order.deliveryMethod === 'buyer_pickup';
}

// See the matching helper in useFarmerActiveDeliverySharing.js — same reasoning.
function isValidCoordinate(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

// The buyer_pickup mirror of useFarmerActiveDeliverySharing.js — same shape, same reasoning
// (mounted once at the app shell level so sharing starts/stops based on whether the signed-in
// account HAS an active pickup at all, regardless of which page they're looking at), just the
// other direction: the BUYER shares their own live position while they're the one traveling
// (to the farm, once it's ready_for_pickup — buyer_pickup's equivalent of out_for_delivery),
// over the 'buyer-location' socket event (see backend/src/realtime/orderTracking.js). Lets
// LiveDeliveryMap.jsx show the exact same rotating-arrow live-navigation view for a pickup
// trip as it already does for a real delivery — just tracking the buyer instead of the farmer.
export function useBuyerActivePickupSharing(buyerId) {
  const [activeOrderIds, setActiveOrderIds] = useState([]);
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('online');
  const activeOrderIdsRef = useRef([]);
  const joinedOrderIdsRef = useRef(new Set());
  const watchIdRef = useRef(null);
  const lastSentAtRef = useRef(0);
  const lastSentPositionRef = useRef(null);
  const isOnlineRef = useRef(typeof navigator === 'undefined' || navigator.onLine !== false);
  const isSocketConnectedRef = useRef(false);
  const hasGpsErrorRef = useRef(false);
  const connectionStatusRef = useRef('online');

  useEffect(() => {
    if (!buyerId) return undefined;
    let cancelled = false;
    const poll = () => {
      getOrdersByBuyer(buyerId)
        .then((orders) => {
          if (cancelled) return;
          const ids = orders.filter(isActivePickupOrder).map((order) => order.id);
          activeOrderIdsRef.current = ids;
          setActiveOrderIds(ids);
        })
        .catch(() => {
          // A transient failure here just skips this tick — the next poll retries, and
          // whatever watch is already running keeps sharing to the last known order list.
        });
    };
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [buyerId]);

  const joinOrder = async (orderId) => {
    if (joinedOrderIdsRef.current.has(orderId)) return true;
    const socket = getSocket();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return false;
    const joined = await new Promise((resolve) => {
      socket.emit('join-order', { orderId, token: session.access_token }, (response) => {
        resolve(Boolean(response?.ok));
      });
    });
    if (joined) joinedOrderIdsRef.current.add(orderId);
    return joined;
  };

  // See the matching, more fully-commented version of this in
  // useFarmerActiveDeliverySharing.js — same reasoning throughout.
  const refreshConnectionStatus = () => {
    const next = !isOnlineRef.current
      ? 'offline'
      : !isSocketConnectedRef.current
        ? 'reconnecting'
        : hasGpsErrorRef.current
          ? 'gps-lost'
          : 'online';
    if (next === connectionStatusRef.current) return;
    connectionStatusRef.current = next;
    setConnectionStatus(next);
    const socket = getSocket();
    if (!socket.connected) return;
    joinedOrderIdsRef.current.forEach((orderId) => socket.emit('share-status', { orderId, status: next }));
  };

  useEffect(() => {
    const handleOnline = () => {
      isOnlineRef.current = true;
      refreshConnectionStatus();
    };
    const handleOffline = () => {
      isOnlineRef.current = false;
      refreshConnectionStatus();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();
    isSocketConnectedRef.current = socket.connected;
    const handleConnect = () => {
      joinedOrderIdsRef.current.clear();
      isSocketConnectedRef.current = true;
      refreshConnectionStatus();
      activeOrderIdsRef.current.forEach(async (orderId) => {
        const joined = await joinOrder(orderId);
        if (joined) socket.emit('share-status', { orderId, status: connectionStatusRef.current });
      });
    };
    const handleDisconnect = () => {
      isSocketConnectedRef.current = false;
      refreshConnectionStatus();
    };
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  const stopWatch = () => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    setError('');
  };

  const startWatch = () => {
    if (watchIdRef.current != null) return;
    if (!navigator.geolocation) {
      setError('Location sharing is not supported on this device.');
      return;
    }
    setError('');
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        // See the matching check in useFarmerActiveDeliverySharing.js — never worth sending,
        // never worth counting as "the GPS is healthy again" below.
        if (!isValidCoordinate(lat, lng)) return;

        if (hasGpsErrorRef.current) {
          hasGpsErrorRef.current = false;
          refreshConnectionStatus();
        }

        const now = Date.now();
        const dueByTime = now - lastSentAtRef.current >= MIN_SEND_INTERVAL_MS;
        const dueByMovement = lastSentPositionRef.current
          ? haversineKm(lastSentPositionRef.current, { lat, lng }) >= MIN_SEND_MOVE_KM
          : true;
        if (!dueByTime && !dueByMovement) return;
        lastSentAtRef.current = now;
        lastSentPositionRef.current = { lat, lng };

        const accuracy = position.coords.accuracy;
        const heading = position.coords.heading;
        const speed = position.coords.speed;
        const socket = getSocket();
        activeOrderIdsRef.current.forEach(async (orderId) => {
          const joined = await joinOrder(orderId);
          if (!joined) return;
          socket.emit('buyer-location', { orderId, lat, lng, accuracy, heading, speed }, (response) => {
            if (response && !response.ok) setError(response.error || 'Could not share your location.');
            else setError('');
          });
        });
      },
      (geoError) => {
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError('Location permission was denied — enable location access to share your live position with the farmer.');
          stopWatch();
        } else if (geoError.code === geoError.TIMEOUT) {
          setError('Location signal is weak — retrying…');
          hasGpsErrorRef.current = true;
          refreshConnectionStatus();
        } else {
          setError('Could not access your location. Check your device’s location/GPS is turned on.');
          hasGpsErrorRef.current = true;
          refreshConnectionStatus();
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeOrderIds.length > 0) startWatch();
    else stopWatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrderIds]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  return { isSharing: activeOrderIds.length > 0, error, connectionStatus };
}
