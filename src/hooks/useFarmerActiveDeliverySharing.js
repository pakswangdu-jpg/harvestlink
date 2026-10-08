import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getSocket } from '../lib/socketClient';
import { getOrdersByFarmer } from '../services/orderService';
import { publishLiveOrderPosition, clearLiveOrderPositions } from '../services/liveTrackingStore';
import { isFreshLivePosition, normalizeLivePosition } from '../utils/liveTrackingPosition';
import { haversineKm } from '../utils/geo';
import {
  computeVehicleBearing,
  normalizeVehicleHeading,
  VEHICLE_HEADING_MIN_MOVEMENT_KM,
} from '../utils/vehicleMarker';

const POLL_INTERVAL_MS = 6000;
const MIN_RELIABLE_HEADING_SPEED_MPS = 0.8;

function isActiveDeliveryOrder(order) {
  return order.status === 'confirmed' && order.deliveryStatus === 'out_for_delivery' && order.deliveryMethod === 'farmer_delivery';
}

export function useFarmerActiveDeliverySharing(farmerId, locationPermission) {
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('online');
  const resumeLocationRef = useRef(null);

  useEffect(() => {
    if (!farmerId) return undefined;
    const socket = getSocket();
    let cancelled = false;
    let polling = false;
    let activeIds = new Set();
    let watchId = null;
    let permissionDenied = false;
    let gpsError = false;
    let latestPosition = null;
    let lastHeadingPosition = null;
    let lastReliableHeading = null;
    const joined = new Set();
    const joining = new Map();
    const sending = new Set();

    const refreshStatus = () => {
      const status = navigator.onLine === false ? 'offline'
        : !socket.connected ? 'reconnecting' : gpsError ? 'gps-lost' : 'online';
      setConnectionStatus(status);
      if (socket.connected) joined.forEach((orderId) => socket.emit('share-status', { orderId, status }));
    };
    const join = (orderId) => {
      if (joined.has(orderId)) return Promise.resolve(true);
      if (joining.has(orderId)) return joining.get(orderId);
      const promise = (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (cancelled || !socket.connected || !session?.access_token) return false;
          const response = await new Promise((resolve) => {
            socket.timeout(10000).emit('join-order', { orderId, token: session.access_token }, (err, value) => resolve(err ? null : value));
          });
          if (cancelled || !socket.connected || !response?.ok) return false;
          joined.add(orderId);
          return true;
        } catch { return false; }
        finally { joining.delete(orderId); }
      })();
      joining.set(orderId, promise);
      return promise;
    };
    const send = async (orderId) => {
      if (cancelled || !socket.connected || sending.has(orderId)) return;
      sending.add(orderId);
      let sentPosition = null;
      try {
        if (!await join(orderId) || cancelled || !socket.connected || !activeIds.has(orderId)) return;
        // Read after joining: a newer GPS callback may have arrived during authentication.
        const position = latestPosition;
        if (!position || !isFreshLivePosition(position)) return;
        sentPosition = position;
        await new Promise((resolve) => {
          socket.timeout(10000).emit('farmer-location', {
            orderId, lat: position.lat, lng: position.lng, accuracy: position.accuracy,
            heading: position.heading, speed: position.speed, timestamp: position.timestamp,
            sampleAgeMs: Math.max(0, Date.now() - position.timestamp),
          }, (err, response) => {
            if (!cancelled) setError(err ? 'Location connection interrupted. Retrying.'
              : response?.ok ? '' : response?.error || 'Could not share your location.');
            resolve();
          });
        });
      } finally {
        sending.delete(orderId);
        // Drain a newer real fix received while the previous socket ack was pending.
        if (sentPosition && latestPosition !== sentPosition && !cancelled && socket.connected && activeIds.has(orderId)) {
          void send(orderId);
        }
      }
    };
    const stopWatch = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      watchId = null;
    };
    const startWatch = () => {
      if (watchId != null || permissionDenied || cancelled) return;
      if (!navigator.geolocation) {
        setError('Location sharing is not supported on this device.');
        return;
      }
      watchId = navigator.geolocation.watchPosition((position) => {
        if (cancelled || !activeIds.size) return;
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        const gpsHeading = normalizeVehicleHeading(position.coords.heading);
        const speed = Number.isFinite(position.coords.speed) ? position.coords.speed : null;
        const movedForHeading = !lastHeadingPosition
          || haversineKm(lastHeadingPosition, point) >= VEHICLE_HEADING_MIN_MOVEMENT_KM;
        const heading = gpsHeading != null && (speed >= MIN_RELIABLE_HEADING_SPEED_MPS || (speed == null && movedForHeading))
          ? gpsHeading
          : movedForHeading && lastHeadingPosition
            ? computeVehicleBearing(lastHeadingPosition, point)
            : lastReliableHeading;
        const next = normalizeLivePosition({
          lat: point.lat, lng: point.lng,
          accuracy: position.coords.accuracy, speed,
          heading,
          timestamp: position.timestamp,
        });
        if (!next || !isFreshLivePosition(next) || (latestPosition && next.timestamp < latestPosition.timestamp)) return;
        latestPosition = next;
        if (movedForHeading) {
          lastHeadingPosition = next;
        }
        if (next.heading != null) lastReliableHeading = next.heading;
        gpsError = false;
        setError('');
        refreshStatus();
        // Local marker/route consume this fix immediately, independently of network/compass.
        activeIds.forEach((orderId) => publishLiveOrderPosition(orderId, next, { source: 'gps' }));
        activeIds.forEach((orderId) => { void send(orderId); });
      }, (geoError) => {
        if (cancelled) return;
        gpsError = true;
        if (geoError.code === 1) {
          permissionDenied = true;
          stopWatch();
          setError('Location permission was denied — enable location access to share your live position with buyers.');
        } else {
          setError(geoError.code === 3 ? 'Location signal is weak — retrying…' : 'Could not access your location. Check that GPS is turned on.');
        }
        refreshStatus();
      }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
    };
    resumeLocationRef.current = () => {
      permissionDenied = false;
      if (activeIds.size) { setError(''); startWatch(); }
    };
    const poll = async () => {
      if (cancelled || polling) return;
      polling = true;
      try {
        const orders = await getOrdersByFarmer(farmerId);
        if (cancelled) return;
        const nextIds = new Set(orders.filter(isActiveDeliveryOrder).map((order) => order.id));
        const added = [...nextIds].filter((id) => !activeIds.has(id));
        activeIds = nextIds;
        setIsSharing(activeIds.size > 0);
        if (activeIds.size) {
          startWatch();
          added.forEach((orderId) => {
            if (latestPosition && isFreshLivePosition(latestPosition)) {
              publishLiveOrderPosition(orderId, latestPosition, { source: 'gps' });
              void send(orderId);
            }
          });
        } else {
          stopWatch();
          latestPosition = null;
          permissionDenied = false;
          setError('');
        }
      } catch { /* The existing watcher continues through temporary order API failures. */ }
      finally { polling = false; }
    };
    const handleConnect = () => {
      joined.clear();
      refreshStatus();
      activeIds.forEach((orderId) => { void send(orderId); });
    };
    const handleDisconnect = () => { joined.clear(); refreshStatus(); };
    const handleOnline = () => { refreshStatus(); activeIds.forEach((orderId) => { void send(orderId); }); };
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', refreshStatus);
    void poll();
    const pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    // Resend only the latest actual sample; never renew its acquisition timestamp.
    const retryTimer = setInterval(() => {
      activeIds.forEach((orderId) => { void send(orderId); });
    }, 15000);
    return () => {
      cancelled = true;
      resumeLocationRef.current = null;
      stopWatch();
      clearInterval(pollTimer);
      clearInterval(retryTimer);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', refreshStatus);
      clearLiveOrderPositions();
    };
  }, [farmerId]);

  useEffect(() => {
    if (locationPermission === 'granted') resumeLocationRef.current?.();
  }, [locationPermission]);

  return { isSharing, error, connectionStatus };
}
