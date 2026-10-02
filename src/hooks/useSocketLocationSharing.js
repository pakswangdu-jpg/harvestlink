import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getSocket } from '../lib/socketClient';
import { getDeviceCompassHeading, normalizeVehicleHeading, smoothVehicleHeading } from '../utils/vehicleMarker';





const MIN_SEND_INTERVAL_MS = 4000;
const DEVICE_HEADING_MAX_AGE_MS = 10000;

export function useSocketLocationSharing(orderId) {
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState('');
  const watchIdRef = useRef(null);
  const lastSentAtRef = useRef(0);
  const isSharingRef = useRef(false);
  const orientationHandlerRef = useRef(null);
  const deviceHeadingRef = useRef(null);
  const deviceHeadingUpdatedAtRef = useRef(0);

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      if (orientationHandlerRef.current) {
        window.removeEventListener('deviceorientation', orientationHandlerRef.current);
        window.removeEventListener('deviceorientationabsolute', orientationHandlerRef.current);
      }
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
    if (orientationHandlerRef.current) {
      window.removeEventListener('deviceorientation', orientationHandlerRef.current);
      window.removeEventListener('deviceorientationabsolute', orientationHandlerRef.current);
      orientationHandlerRef.current = null;
    }
    watchIdRef.current = null;
    isSharingRef.current = false;
    setIsSharing(false);
  };

  const requestOrientationPermission = async () => {
    const orientationEvent = window.DeviceOrientationEvent;
    if (typeof orientationEvent?.requestPermission !== 'function') return true;
    try {
      return (await orientationEvent.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  };

  const startOrientationUpdates = () => {
    if (orientationHandlerRef.current) {
      window.removeEventListener('deviceorientation', orientationHandlerRef.current);
      window.removeEventListener('deviceorientationabsolute', orientationHandlerRef.current);
    }
    deviceHeadingRef.current = null;
    deviceHeadingUpdatedAtRef.current = 0;
    orientationHandlerRef.current = (event) => {
      const screenAngle = window.screen?.orientation?.angle ?? window.orientation ?? 0;
      const heading = getDeviceCompassHeading(
        event,
        screenAngle,
        event.type === 'deviceorientationabsolute',
      );
      if (heading == null) return;
      deviceHeadingRef.current = smoothVehicleHeading(deviceHeadingRef.current, heading);
      deviceHeadingUpdatedAtRef.current = Date.now();
    };
    window.addEventListener('deviceorientationabsolute', orientationHandlerRef.current);
    window.addEventListener('deviceorientation', orientationHandlerRef.current);
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
    startOrientationUpdates();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastSentAtRef.current < MIN_SEND_INTERVAL_MS) return;
        lastSentAtRef.current = now;
        const gpsHeading = normalizeVehicleHeading(position.coords.heading);
        const deviceHeadingIsFresh = now - deviceHeadingUpdatedAtRef.current <= DEVICE_HEADING_MAX_AGE_MS;
        const heading = deviceHeadingIsFresh ? deviceHeadingRef.current : gpsHeading;
        socket.emit('farmer-location', {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          ...(heading == null ? {} : { heading }),
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

  return { isSharing, error, start, stop, requestOrientationPermission };
}
