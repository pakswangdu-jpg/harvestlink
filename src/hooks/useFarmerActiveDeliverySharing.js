import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getSocket } from '../lib/socketClient';
import { getOrdersByFarmer } from '../services/orderService';
import { haversineKm } from '../utils/geo';

const POLL_INTERVAL_MS = 6000;
// 3-5s cadence, sent over Socket.IO (see backend/src/realtime/orderTracking.js) — matches
// every other live-location sender in the app.
const MIN_SEND_INTERVAL_MS = 4000;
// ...or sooner, the instant the farmer has genuinely moved this far — matters at driving
// speed, where 10m can pass well inside the 4s timer (e.g. ~0.6s at 60 km/h).
const MIN_SEND_MOVE_KM = 0.01;

// Only farmer_delivery ever has the FARMER's own device sharing a live position — buyer_pickup
// shares the BUYER's instead (see useBuyerActivePickupSharing.js), and courier orders are
// handed off to a third party (Lalamove) entirely: HarvestLink never tracks a courier's GPS,
// so there's nothing for the farmer's device to share once a courier order goes out for
// delivery (see DeliveryInfoCard.jsx / LinkLalamoveDeliveryDialog.jsx instead).
function isActiveDeliveryOrder(order) {
  return order.status === 'confirmed' && order.deliveryStatus === 'out_for_delivery' && order.deliveryMethod === 'farmer_delivery';
}

// A farmer can mark an order "out for delivery" from several places (the order's own tracking
// page, the orders list, ...) — tying GPS sharing to one specific page being mounted meant it
// silently never started if the farmer used any other one. This hook is mounted once at the
// app shell level (every farmer page renders AppShell), so sharing starts/stops based on
// whether the farmer HAS an active delivery at all, regardless of which page they're looking
// at. Sends over Socket.IO (sub-second fan-out to the buyer's tracking view) rather than the
// REST endpoint — broadcasts to every currently-active order at once (rare in practice, but a
// farmer could have more than one out for delivery in the same trip): one real device
// position, joined into each active order's own room.

// Rejects a raw GPS reading that's non-finite, physically impossible (outside real lat/lng
// bounds), or (0, 0) — "null island", which is what a chip commonly reports mid-reacquisition
// rather than erroring out, so a literal 0/0 is treated as invalid rather than a real position.
function isValidCoordinate(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

export function useFarmerActiveDeliverySharing(farmerId) {
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
    if (!farmerId) return undefined;
    let cancelled = false;
    const poll = () => {
      getOrdersByFarmer(farmerId)
        .then((orders) => {
          if (cancelled) return;
          const ids = orders.filter(isActiveDeliveryOrder).map((order) => order.id);
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
  }, [farmerId]);

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

  // Recomputes 'online' | 'offline' | 'reconnecting' | 'gps-lost' from the three signals that
  // feed it (network state, socket connection, GPS watch health) and — only when it actually
  // changed — updates local state and best-effort announces it to whichever orders are
  // currently joined. Deliberately does NOT try to announce 'offline' itself: a socket that's
  // already disconnected can't emit anything, which is exactly why the server's own
  // 'disconnect' handler (backend/src/realtime/orderTracking.js) broadcasts that on this
  // client's behalf instead — the one signal this function can never send is the one that
  // matters most, so it doesn't try.
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

  // A network drop resets socket.data server-side on reconnect, so every room this socket
  // had joined needs rejoining — clearing the local cache here means the next GPS tick's
  // joinOrder() call naturally does that instead of assuming a stale join still holds. Also
  // rejoins every currently-active order right away (rather than waiting for the next
  // throttled GPS tick, up to MIN_SEND_INTERVAL_MS later) and confirms the current status to
  // each the moment its rejoin lands — this is what makes a viewer's badge flip back to
  // Online within a second of the connection actually returning, not several seconds after.
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
        // A GPS chip mid-reacquisition commonly reports (0,0) or an out-of-range value rather
        // than erroring out — never worth sending, and never worth even counting as "the GPS
        // is healthy again" below.
        if (!isValidCoordinate(lat, lng)) return;

        // A fix arrived at all, so whatever earlier TIMEOUT/POSITION_UNAVAILABLE run this
        // watch was in is over — matters even on a tick that gets throttled away below, since
        // "gps-lost" should clear the moment a fix actually succeeds, not only on a tick that
        // happens to also be due to send.
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
        // Both frequently null even while genuinely moving — plenty of devices only report a
        // heading/speed fix above a certain walking/driving speed. Sent as-is; the backend and
        // every consumer already treat these as optional enrichment, never required.
        const heading = position.coords.heading;
        const speed = position.coords.speed;
        const socket = getSocket();
        activeOrderIdsRef.current.forEach(async (orderId) => {
          const joined = await joinOrder(orderId);
          if (!joined) return;
          socket.emit('farmer-location', { orderId, lat, lng, accuracy, heading, speed }, (response) => {
            // A single missed tick isn't worth surfacing — the next position fix retries.
            // A prior transient error shouldn't linger once a later update actually lands.
            if (response && !response.ok) setError(response.error || 'Could not share your location.');
            else setError('');
          });
        });
      },
      (geoError) => {
        // A denied permission won't recover on its own retry — stop the watch so it doesn't
        // keep silently failing, and say so plainly. Timeouts/unavailable fixes are usually
        // transient (e.g. briefly indoors), so those keep retrying instead of giving up.
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError('Location permission was denied — enable location access to share your live position with buyers.');
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
    // Synchronizing an external system (the browser's geolocation watch) with derived React
    // state, not a "you might not need an effect" case — same shape as the already-proven
    // start/stop pattern in useSocketLocationSharing.js.
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
