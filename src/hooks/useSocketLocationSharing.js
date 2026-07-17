import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getSocket } from '../lib/socketClient';

// 3-5s cadence, sent over the socket (see backend/src/realtime/orderTracking.js) instead of
// the REST PATCH /orders/:id/location the existing useLiveLocationSharing.js hook uses — a
// separate, additive hook so the already-working REST-based sharing flow used elsewhere
// stays completely untouched.
const MIN_SEND_INTERVAL_MS = 4000;

export function useSocketLocationSharing(orderId) {
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState('');
  const watchIdRef = useRef(null);
  const lastSentAtRef = useRef(0);
  const isSharingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // watchPosition itself survives a dropped websocket fine (it's a separate browser API) —
  // but the server forgets this socket's room membership on reconnect (a fresh socket.data),
  // so without this, GPS ticks would silently fail to save/broadcast after any network blip
  // until the farmer manually reopens the tracking modal. Only rejoins if a share session was
  // actually in progress, so this is a no-op on the initial connect.
  useEffect(() => {
    const socket = getSocket();
    const rejoinOnReconnect = async () => {
      if (!isSharingRef.current || !orderId) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      socket.emit('join-order', { orderId, token: session.access_token }, (response) => {
        if (!response?.ok) setError(response?.error || 'Could not resume sharing your location.');
      });
    };
    socket.on('connect', rejoinOnReconnect);
    return () => socket.off('connect', rejoinOnReconnect);
  }, [orderId]);

  const stop = () => {
    if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    watchIdRef.current = null;
    isSharingRef.current = false;
    setIsSharing(false);
  };

  const start = async () => {
    if (!navigator.geolocation) {
      setError('Location sharing is not supported on this device.');
      return;
    }
    setError('');

    const socket = getSocket();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setError('You need to be signed in to share your location.');
      return;
    }

    const joined = await new Promise((resolve) => {
      socket.emit('join-order', { orderId, token: session.access_token }, (response) => {
        if (!response?.ok) setError(response?.error || 'Could not start sharing your location.');
        resolve(Boolean(response?.ok));
      });
    });
    if (!joined) return;
    isSharingRef.current = true;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastSentAtRef.current < MIN_SEND_INTERVAL_MS) return;
        lastSentAtRef.current = now;
        socket.emit('farmer-location', {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }, (response) => {
          // A single missed tick isn't worth surfacing — the next position fix retries.
          // Only a hard rejection (order no longer out for delivery, etc.) is worth showing.
          // A prior transient error (e.g. one momentary GPS read failure) shouldn't linger
          // on screen once a later update actually goes through fine.
          if (response && !response.ok) setError(response.error || 'Could not share your location.');
          else setError('');
        });
      },
      (geoError) => {
        // A denied permission won't recover on its own retry — stop the watch so it doesn't
        // keep silently failing, and say so plainly. Timeouts/unavailable fixes are usually
        // transient (e.g. briefly indoors), so those keep retrying instead of giving up.
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError('Location permission was denied. Enable location access in your device settings to keep sharing.');
          stop();
        } else if (geoError.code === geoError.TIMEOUT) {
          setError('Location signal is weak — retrying…');
        } else {
          setError('Could not access your location. Check your device’s location/GPS is turned on.');
        }
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    setIsSharing(true);
  };

  return { isSharing, error, start, stop };
}
