import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getSocket } from '../lib/socketClient';





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




          if (response && !response.ok) setError(response.error || 'Could not share your location.');
          else setError('');
        });
      },
      (geoError) => {



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
