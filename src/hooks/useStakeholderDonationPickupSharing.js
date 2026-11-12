import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getSocket } from '../lib/socketClient';
import {
  getDonationsForStakeholder,
  updateDonationPickupLocation,
} from '../services/donationService';
import { publishLiveOrderPosition } from '../services/liveTrackingStore';
import { isDonationPickupTrackable } from '../utils/donationWorkflow';

const POLL_INTERVAL_MS = 5000;

function isValidCoordinate(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

export function extractTrackableStakeholderPickups(donations = [], stakeholderId = null) {
  const sessions = [];
  for (const donation of donations || []) {
    if (!donation || typeof donation !== 'object') continue;
    const claim = donation.myClaim || null;
    if (claim && isDonationPickupTrackable(claim)) {
      sessions.push({
        targetId: claim.id,
        donationId: donation.id,
        claimId: claim.id,
        donation,
        claim,
        record: {
          ...donation,
          ...claim,
          id: claim.id,
          donationId: donation.id,
          claimId: claim.id,
          productName: donation.productName,
          unit: donation.unit,
          farmerId: donation.farmerId,
          farmerName: donation.farmerName,
          location: donation.location,
        },
      });
    } else if (
      (!stakeholderId || donation.requestedById === stakeholderId) &&
      isDonationPickupTrackable(donation)
    ) {
      sessions.push({
        targetId: donation.id,
        donationId: donation.id,
        claimId: null,
        donation,
        claim: null,
        record: {
          ...donation,
          donationId: donation.id,
          claimId: null,
        },
      });
    }
  }
  return sessions;
}

function readSeenPopupIds(stakeholderId) {
  if (!stakeholderId || typeof sessionStorage === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(`hl_auto_pickup_popup_${stakeholderId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeSeenPopupIds(stakeholderId, set) {
  if (!stakeholderId || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(`hl_auto_pickup_popup_${stakeholderId}`, JSON.stringify([...set]));
  } catch {
    // Ignore storage quota issues.
  }
}

export function useStakeholderDonationPickupSharing(stakeholderId, initialPermission = 'prompt') {
  const [sessions, setSessions] = useState([]);
  const [allDonations, setAllDonations] = useState([]);
  const [activePopupTargetId, setActivePopupTargetId] = useState(null);
  const normalizedPermission = ['granted', 'denied', 'unsupported', 'insecure'].includes(initialPermission)
    ? initialPermission
    : 'prompt';
  const [permissionState, setPermissionState] = useState(normalizedPermission);
  const [lastInitialPermission, setLastInitialPermission] = useState(initialPermission);
  if (lastInitialPermission !== initialPermission) {
    setLastInitialPermission(initialPermission);
    setPermissionState(normalizedPermission);
  }
  const [permissionError, setPermissionError] = useState('');
  const [trackingLoadError, setTrackingLoadError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('online');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [latestArrival, setLatestArrival] = useState(null);

  const sessionsRef = useRef([]);
  const joinedTargetIdsRef = useRef(new Set());
  const watchIdRef = useRef(null);
  const latestPositionRef = useRef(null);
  const seenPopupIdsRef = useRef(readSeenPopupIds(stakeholderId));

  useEffect(() => {
    seenPopupIdsRef.current = readSeenPopupIds(stakeholderId);
  }, [stakeholderId]);

  const reloadSessions = useCallback(() => {
    if (!stakeholderId) return Promise.resolve();
    return getDonationsForStakeholder(stakeholderId)
      .then((list) => {
        setTrackingLoadError('');
        setAllDonations(Array.isArray(list) ? list : []);
        const trackable = extractTrackableStakeholderPickups(list, stakeholderId);
        sessionsRef.current = trackable;
        setSessions(trackable);

        for (const session of trackable) {
          if (!seenPopupIdsRef.current.has(session.targetId)) {
            seenPopupIdsRef.current.add(session.targetId);
            writeSeenPopupIds(stakeholderId, seenPopupIdsRef.current);
            setActivePopupTargetId((current) => current || session.targetId);
          }
        }
      })
      .catch((error) => {
        setTrackingLoadError(error?.message || 'Could not load pickup tracking. Check your connection and retry.');
      });
  }, [stakeholderId]);

  useEffect(() => {
    if (!stakeholderId) return undefined;
    let cancelled = false;
    const poll = () => {
      getDonationsForStakeholder(stakeholderId)
        .then((list) => {
          if (cancelled) return;
          setTrackingLoadError('');
          setAllDonations(Array.isArray(list) ? list : []);
          const trackable = extractTrackableStakeholderPickups(list, stakeholderId);
          sessionsRef.current = trackable;
          setSessions(trackable);

          for (const session of trackable) {
            if (!seenPopupIdsRef.current.has(session.targetId)) {
              seenPopupIdsRef.current.add(session.targetId);
              writeSeenPopupIds(stakeholderId, seenPopupIdsRef.current);
              setActivePopupTargetId((current) => current || session.targetId);
            }
          }
        })
        .catch((error) => {
          if (cancelled) return;
          setTrackingLoadError(error?.message || 'Could not load pickup tracking. Check your connection and retry.');
        });
    };
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    const onUpdated = () => poll();
    if (typeof window !== 'undefined') {
      window.addEventListener('harvestlink:donation-updated', onUpdated);
    }
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (typeof window !== 'undefined') {
        window.removeEventListener('harvestlink:donation-updated', onUpdated);
      }
    };
  }, [stakeholderId]);

  const joinTargetRoom = useCallback(async (targetId) => {
    if (!targetId) return false;
    if (joinedTargetIdsRef.current.has(targetId)) return true;
    try {
      const socket = getSocket();
      if (!socket.connected) return false;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return false;
      const joined = await new Promise((resolve) => {
        socket.timeout(10000).emit('join-order', { orderId: targetId, token: session.access_token }, (err, res) => {
          resolve(!err && Boolean(res?.ok));
        });
      });
      if (joined) joinedTargetIdsRef.current.add(targetId);
      return joined;
    } catch {
      return false;
    }
  }, []);

  const broadcastSampleToSessions = useCallback(
    async (coords, timestampMs) => {
      const activeList = sessionsRef.current;
      const { latitude: lat, longitude: lng, accuracy, heading, speed } = coords;
      if (!isValidCoordinate(lat, lng)) return;

      latestPositionRef.current = { coords, timestampMs };
      if (!activeList.length) return;
      const nowIso = new Date().toISOString();
      setLastUpdatedAt(nowIso);
      setConnectionStatus('online');
      setPermissionError(
        Number.isFinite(accuracy) && accuracy > 100
          ? 'GPS signal is too imprecise to show as a live location. Move somewhere with a clearer signal and retry.'
          : '',
      );

      for (const item of activeList) {
        publishLiveOrderPosition(item.targetId, {
          lat,
          lng,
          accuracy,
          heading,
          speed,
          timestamp: timestampMs,
          locationUpdatedAt: nowIso,
        }, { source: 'gps' });

        joinTargetRoom(item.targetId).then((joined) => {
          try {
            const socket = getSocket();
            if (joined && socket.connected) {
              socket.emit('stakeholder-location', {
                orderId: item.targetId,
                donationId: item.donationId,
                claimId: item.claimId,
                lat,
                lng,
                accuracy,
                heading,
                speed,
                timestamp: timestampMs,
              });
            }
          } catch {
            // Socket fallback handled by REST call below.
          }
        });

        try {
          const result = await updateDonationPickupLocation(
            item.donationId,
            { lat, lng, accuracy, heading, speed },
            item.claimId,
          );
          if (result?.arrival) {
            setLatestArrival((prev) => ({
              ...prev,
              [item.targetId]: result.arrival,
            }));
          }
          if (result?.pickupStatus === 'confirmed' || result?.status === 'completed') {
            reloadSessions();
          }
        } catch (error) {
          setConnectionStatus('gps-lost');
          setPermissionError(error?.message || 'Could not share your GPS location. Check your connection and retry.');
        }
      }
    },
    [joinTargetRoom, reloadSessions],
  );

  useEffect(() => {
    let socket = null;
    try {
      socket = getSocket();
    } catch {
      return undefined;
    }
    const handleConnect = () => {
      joinedTargetIdsRef.current.clear();
      setConnectionStatus('online');
      sessionsRef.current.forEach((item) => {
        void joinTargetRoom(item.targetId);
      });
      if (latestPositionRef.current) {
        const { coords, timestampMs } = latestPositionRef.current;
        void broadcastSampleToSessions(coords, timestampMs);
      }
    };
    const handleDisconnect = () => {
      joinedTargetIdsRef.current.clear();
      setConnectionStatus('reconnecting');
    };
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [joinTargetRoom, broadcastSampleToSessions]);

  const sessionKey = sessions.map((session) => session.targetId).join('|');
  useEffect(() => {
    if (!sessionKey || !latestPositionRef.current) return;
    const { coords, timestampMs } = latestPositionRef.current;
    void broadcastSampleToSessions(coords, timestampMs);
  }, [sessionKey, broadcastSampleToSessions]);

  const requestGpsPermission = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPermissionState('unsupported');
      setPermissionError(
        'Your browser does not support GPS geolocation. Please open HarvestLink on a GPS-enabled mobile device or browser.',
      );
      return Promise.resolve(false);
    }

    setPermissionError('');
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setPermissionState('granted');
          setPermissionError('');
          setConnectionStatus('online');
          broadcastSampleToSessions(position.coords, position.timestamp);
          resolve(true);
        },
        (err) => {
          if (err?.code === 1) {
            setPermissionState('denied');
            setPermissionError(
              'Location permission was denied. Please allow location access in your browser settings and click Retry Location Sharing so the farmer can track your pickup and verify arrival.',
            );
          } else {
            setPermissionState('error');
            setPermissionError(
              err?.code === 3
                ? 'GPS timed out before getting a fix. Turn on device Location Services, move somewhere with a clearer signal, and retry.'
                : 'Unable to acquire GPS right now. Turn on device Location Services and retry.',
            );
          }
          setConnectionStatus('gps-lost');
          resolve(false);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 },
      );
    });
  }, [broadcastSampleToSessions]);

  useEffect(() => {
    if (
      !stakeholderId ||
      permissionState !== 'granted' ||
      sessions.length === 0 ||
      typeof navigator === 'undefined' ||
      !navigator.geolocation
    ) {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return undefined;
    }

    if (watchIdRef.current !== null) return undefined;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setPermissionError('');
        broadcastSampleToSessions(position.coords, position.timestamp);
      },
      (err) => {
        if (err?.code === 1) {
          setPermissionState('denied');
          setPermissionError(
            'Location permission was denied. Please allow location access in your browser settings and click Retry Location Sharing.',
          );
          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
        } else {
          setConnectionStatus('gps-lost');
          setPermissionError(
            err?.code === 3
              ? 'GPS timed out before getting a fix. Turn on device Location Services, move somewhere with a clearer signal, and retry.'
              : 'Unable to acquire GPS right now. Turn on device Location Services and retry.',
          );
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    );

    return () => {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [stakeholderId, permissionState, sessions.length, broadcastSampleToSessions]);

  const activePopupSession =
    sessions.find((item) => item.targetId === activePopupTargetId) ||
    (() => {
      if (!activePopupTargetId) return null;
      for (const donation of allDonations) {
        if (donation.id === activePopupTargetId) {
          return {
            targetId: donation.id,
            donationId: donation.id,
            claimId: null,
            donation,
            claim: null,
            record: donation,
          };
        }
        if (donation.myClaim?.id === activePopupTargetId) {
          return {
            targetId: donation.myClaim.id,
            donationId: donation.id,
            claimId: donation.myClaim.id,
            donation,
            claim: donation.myClaim,
            record: {
              ...donation,
              ...donation.myClaim,
              id: donation.myClaim.id,
              donationId: donation.id,
              claimId: donation.myClaim.id,
            },
          };
        }
      }
      return null;
    })();

  const openTrackingPopup = useCallback((targetId) => {
    setActivePopupTargetId(targetId);
  }, []);

  const closeTrackingPopup = useCallback(() => {
    setActivePopupTargetId(null);
  }, []);

  return {
    sessions,
    activePopupSession,
    activePopupTargetId,
    openTrackingPopup,
    closeTrackingPopup,
    permissionState,
    permissionError,
    trackingLoadError,
    requestGpsPermission,
    connectionStatus,
    lastUpdatedAt,
    latestArrival,
    reloadSessions,
  };
}
