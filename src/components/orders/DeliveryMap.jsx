import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { DARK_MAP_STYLE, loadGoogleMaps } from '../../lib/googleMapsLoader';
import { getMunicipalityCoords } from '../../utils/constants';
import { haversineKm, resolveRoutePoints, validateCoordinates, nearbyMapPoints } from '../../utils/geo';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';
import { distanceToPolylineKm, fetchRoadRoute, pointAlongRoute } from '../../services/routingService';
import { useTheme } from '../../contexts/ThemeContext';
import { MAP_COLORS } from '../../lib/mapMarkerColors';
import { buildMapPopup, buildPresenceMarkup } from '../map/mapPopupMarkup';

import { buildViewerIcon, buildViewerPopup } from '../map/userLocationMarker';
import { isDonationAlert } from '../map/donationMarker';
import { buildFarmerMapMarkerIcon } from '../map/farmerMapMarkerIcon';
import { buildBuyerMapMarkerIcon } from '../map/buyerMapMarkerIcon';
import { buildStakeholderMapMarkerIcon } from '../map/stakeholderMapMarkerIcon';
import {
  applyMarkerStackLayout,
  createProfileMarkerEntry,
  getRoleMarkerKey,
  removeProfileMarkerEntry,
  showProfileMarkerInfo,
  syncMarkerPositions,
  uniqueProfilesById,
} from '../map/mapMarkerUtils';

const CEBU_CENTER = { lat: 10.3157, lng: 123.8854 };

const ROUTE_LINE_COLOR = '#1a73e8';

const LIVE_REROUTE_MIN_INTERVAL_MS = 20000;
const LIVE_REROUTE_MIN_MOVE_KM = 0.05;
const LIVE_REROUTE_DEVIATION_KM = 0.08;
const LIVE_REROUTE_DEVIATION_COOLDOWN_MS = 8000;
const MARKER_ANIMATION_DURATION_MS = 1500;

const PRECISION_LABELS = {
  registered: 'Registered location',
  address: 'Exact registered address',
  municipality: 'Approximate — municipality center',
  fallback: 'Approximate — municipality area',
};

function refreshOpenProfileInfoWindow(map, mapsApi, entriesRef, openInfoWindowRef) {
  const entry = [...entriesRef.current.values()]
    .find((markerEntry) => markerEntry.infoWindow === openInfoWindowRef.current);
  if (entry) showProfileMarkerInfo(map, mapsApi, entry, entriesRef, openInfoWindowRef);
}

function layoutProfileMarkers(entries, separateOverlappingPins) {
  if (separateOverlappingPins) {
    applyMarkerStackLayout(entries);
  } else {
    syncMarkerPositions(entries);
  }
}


const PIN_PATH = 'M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20C24 5.373 18.627 0 12 0z';

function buildPinIcon(mapsApi, color, { alert = false } = {}) {
  const alertRing = alert
    ? `<circle cx="12" cy="12" r="9" fill="none" stroke="${color}" stroke-width="2.5" opacity="0.45"/>`
    : '';
  const svg =
    `<svg width="36" height="48" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">` +
    `${alertRing}<path d="${PIN_PATH}" fill="${color}"/><circle cx="12" cy="12" r="5.5" fill="white"/>` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(36, 48),
    anchor: new mapsApi.Point(18, 48),
  };
}

function buildTruckIcon(mapsApi) {
  const svg =
    `<svg width="30" height="30" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">` +
    `<text x="13" y="21" font-size="24" text-anchor="middle">🚚</text>` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(30, 30),
    anchor: new mapsApi.Point(15, 15),
  };
}

function pointKey(point) {
  return `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
}

function animateMarkerTo(entry, targetPosition, durationMs = MARKER_ANIMATION_DURATION_MS) {
  if (entry.animationFrameId != null) cancelAnimationFrame(entry.animationFrameId);

  const startPosition = entry.marker.getPosition();
  const start = { lat: startPosition.lat(), lng: startPosition.lng() };
  if (Math.abs(start.lat - targetPosition.lat) < 1e-7 && Math.abs(start.lng - targetPosition.lng) < 1e-7) return;

  const startTime = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - startTime) / durationMs);
    entry.marker.setPosition({
      lat: start.lat + (targetPosition.lat - start.lat) * t,
      lng: start.lng + (targetPosition.lng - start.lng) * t,
    });
    entry.animationFrameId = t < 1 ? requestAnimationFrame(step) : null;
  };
  entry.animationFrameId = requestAnimationFrame(step);
}



















export default function DeliveryMap({
  routes = [],
  farmers = [],
  buyers = [],
  stakeholders = [],
  viewerMunicipality = null,
  viewerCoords = null,
  viewerAddress = '',
  nearbyView = false,
  showDonationAlerts = false,
  currentUserId = null,
  currentUserGreen = false,
  farmerMarkersGreen = false,
  separateOverlappingPins = true,
}) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapsApiRef = useRef(null);
  const routeLayerRef = useRef([]);
  const farmerMarkersRef = useRef([]);
  const buyerMarkersRef = useRef([]);
  const stakeholderMarkersRef = useRef([]);
  const profileMarkerEntriesRef = useRef(new Map());
  const openProfileInfoWindowRef = useRef(null);
  const viewerMarkerRef = useRef(null);
  const markerSignaturesRef = useRef({ farmers: null, buyers: null, stakeholders: null });
  const fittedSignatureRef = useRef(null);
  const requestedRouteKeysRef = useRef(new Set());



  const truckMarkersRef = useRef({});



  const liveRouteMetaRef = useRef({});
  const pendingLiveFetchRef = useRef(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const { effectiveTheme } = useTheme();
  const [roadGeometries, setRoadGeometries] = useState({});
  const [liveRouteGeometries, setLiveRouteGeometries] = useState({});
  const uniqueFarmers = useMemo(() => uniqueProfilesById(farmers), [farmers]);
  const uniqueBuyers = useMemo(() => uniqueProfilesById(buyers), [buyers]);
  const uniqueStakeholders = useMemo(() => uniqueProfilesById(stakeholders), [stakeholders]);
  const farmerCoordsById = useMapCoordinates(farmers, { municipalityOnly: nearbyView });
  const buyerCoordsById = useMapCoordinates(buyers, { municipalityOnly: nearbyView });
  const stakeholderCoordsById = useMapCoordinates(stakeholders, { municipalityOnly: nearbyView });






  useEffect(() => {
    const profileMarkerEntries = profileMarkerEntriesRef.current;
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      Object.values(truckMarkersRef.current).forEach((entry) => {
        if (entry.animationFrameId != null) cancelAnimationFrame(entry.animationFrameId);
      });
      [...profileMarkerEntries.values()].forEach((entry) => {
        removeProfileMarkerEntry(entry, { current: profileMarkerEntries });
      });
      viewerMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapperRef.current?.requestFullscreen();
    }
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    let cancelled = false;

    loadGoogleMaps().then((mapsApi) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const center = validateCoordinates(viewerCoords?.lat, viewerCoords?.lng);
      const map = new mapsApi.Map(containerRef.current, {
        ...(center ? { center } : nearbyView ? {} : { center: CEBU_CENTER }),
        zoom: 10,
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: { position: mapsApi.ControlPosition.LEFT_TOP },
        gestureHandling: 'greedy',
        clickableIcons: false,
        styles: effectiveTheme === 'dark' ? DARK_MAP_STYLE : [],
      });
      mapRef.current = map;
      mapsApiRef.current = mapsApi;
      setMapReady(true);
    }).catch(() => {});

    return () => {
      cancelled = true;
    };



    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);




  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.setOptions({ styles: effectiveTheme === 'dark' ? DARK_MAP_STYLE : [] });
  }, [effectiveTheme, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return undefined;
    const syncStacks = () => layoutProfileMarkers(
      [...profileMarkerEntriesRef.current.values()], separateOverlappingPins,
    );
    syncStacks();
    const zoomListener = map.addListener('zoom_changed', syncStacks);
    return () => zoomListener.remove();
  }, [mapReady, separateOverlappingPins]);





  useEffect(() => {
    if (!mapReady || !containerRef.current || !wrapperRef.current) return undefined;
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    let resizeFrame = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeFrame != null) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const center = map.getCenter();
        mapsApi.event.trigger(map, 'resize');
        if (center) map.setCenter(center);
        resizeFrame = null;
      });
    });
    resizeObserver.observe(wrapperRef.current);
    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      if (resizeFrame != null) cancelAnimationFrame(resizeFrame);
    };
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    const signature = JSON.stringify(uniqueFarmers.map((farmer) => {
      const coords = farmerCoordsById[farmer.id];
      return [getRoleMarkerKey('farmer', farmer.id), farmer, coords];
    })) + `:${showDonationAlerts}:${currentUserGreen}:${farmerMarkersGreen}`;
    if (signature === markerSignaturesRef.current.farmers) return;
    markerSignaturesRef.current.farmers = signature;

    const remainingEntries = new Map(farmerMarkersRef.current.map((entry) => [entry.userId, entry]));
    const nextEntries = [];
    uniqueFarmers.forEach((farmer) => {
      const coords = farmerCoordsById[farmer.id];
      if (!coords) return;
      const isYou = Boolean(currentUserId && String(farmer.id) === String(currentUserId));
      const realDisplayName = farmer.farmName || farmer.name;
      const displayName = isYou ? `${realDisplayName} (You)` : realDisplayName;
      const donationAlert = showDonationAlerts && isDonationAlert(farmer, coords);
      const title = donationAlert ? `${displayName}: surplus donation available` : displayName;
      const popupHtml = buildMapPopup({
          name: displayName,
          person: farmer.name,
          municipality: farmer.municipality,
          address: farmer.address,
          barangay: farmer.barangay,
          coords,
          contactNumber: farmer.contactNumber,
          presence: buildPresenceMarkup(farmer),
          precision: PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback,
          products: donationAlert ? '<strong>Surplus donation available</strong>' : '',
          links: isYou
            ? [{ href: `/marketplace?farmerId=${farmer.id}&farmerName=${encodeURIComponent(realDisplayName)}`, label: 'View your products' }]
            : [
                { href: `/marketplace?farmerId=${farmer.id}&farmerName=${encodeURIComponent(realDisplayName)}`, label: 'View products' },
                { href: `/messages/direct/${farmer.id}`, label: 'Contact farmer' },
              ],
        });
      const icon = buildFarmerMapMarkerIcon(mapsApi, { donationAlert, isYou, currentUserGreen, farmerMarkersGreen });
      const zIndex = isYou && currentUserGreen ? 1000 : donationAlert ? 750 : null;
      const existing = remainingEntries.get(String(farmer.id));
      if (existing) {
        existing.marker.setPosition(coords);
        existing.marker.setMap(map);
        existing.marker.setIcon(icon);
        existing.marker.setTitle(title);
        existing.marker.setZIndex(zIndex);
        existing.baseZIndex = zIndex;
        existing.icon = icon;
        existing.layoutAnchor = null;
        existing.isCurrentUser = isYou;
        existing.infoWindow.setContent(popupHtml);
        existing.position = coords;
        existing.title = title;
        existing.popupHtml = popupHtml;
        nextEntries.push(existing);
        remainingEntries.delete(String(farmer.id));
      } else {
        const marker = new mapsApi.Marker({
          position: coords,
          map,
          icon,
          title,
          zIndex: zIndex ?? undefined,
        });
        const infoWindow = new mapsApi.InfoWindow({ content: popupHtml });
        nextEntries.push(createProfileMarkerEntry({
          role: 'farmer',
          userId: farmer.id,
          title,
          marker,
          infoWindow,
          popupHtml,
          position: coords,
          icon,
          isCurrentUser: isYou,
        }, map, mapsApi, profileMarkerEntriesRef, openProfileInfoWindowRef));
      }
    });
    remainingEntries.forEach((entry) => removeProfileMarkerEntry(entry, profileMarkerEntriesRef));
    farmerMarkersRef.current = nextEntries;
    layoutProfileMarkers([...profileMarkerEntriesRef.current.values()], separateOverlappingPins);
    refreshOpenProfileInfoWindow(map, mapsApi, profileMarkerEntriesRef, openProfileInfoWindowRef);
  }, [mapReady, uniqueFarmers, farmerCoordsById, showDonationAlerts, currentUserId, currentUserGreen, farmerMarkersGreen, separateOverlappingPins]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    const lat = Number(viewerCoords?.lat);
    const lng = Number(viewerCoords?.lng);
    const hasViewerPoint = validateCoordinates(viewerCoords?.lat, viewerCoords?.lng);

    const hasRolePin = Boolean(currentUserId && (
      uniqueFarmers.some((f) => String(f.id) === String(currentUserId) && farmerCoordsById[f.id]) ||
      uniqueBuyers.some((b) => String(b.id) === String(currentUserId) && buyerCoordsById[b.id]) ||
      uniqueStakeholders.some((s) => String(s.id) === String(currentUserId) && stakeholderCoordsById[s.id])
    ));

    if (!hasViewerPoint || hasRolePin) {
      if (viewerMarkerRef.current) {
        removeProfileMarkerEntry(viewerMarkerRef.current, profileMarkerEntriesRef);
        viewerMarkerRef.current = null;
      }
      layoutProfileMarkers([...profileMarkerEntriesRef.current.values()], separateOverlappingPins);
      return;
    }

    const position = { lat, lng };
    if (!viewerMarkerRef.current) {
      const marker = new mapsApi.Marker({
        position,
        map,
        icon: buildViewerIcon(mapsApi),
        title: 'Your location',
        zIndex: 900,
      });
      const infoWindow = new mapsApi.InfoWindow({
        content: buildViewerPopup(viewerAddress),
      });
      viewerMarkerRef.current = createProfileMarkerEntry({
        role: 'viewer',
        userId: 'current',
        title: 'Your location',
        marker,
        infoWindow,
        popupHtml: buildViewerPopup(viewerAddress),
        position,
        icon: buildViewerIcon(mapsApi),
        isCurrentUser: true,
      }, map, mapsApi, profileMarkerEntriesRef, openProfileInfoWindowRef);
      layoutProfileMarkers([...profileMarkerEntriesRef.current.values()], separateOverlappingPins);
      return;
    }

    const popupHtml = buildViewerPopup(viewerAddress);
    viewerMarkerRef.current.infoWindow.setContent(popupHtml);
    viewerMarkerRef.current.marker.setMap(map);
    viewerMarkerRef.current.marker.setPosition(position);
    viewerMarkerRef.current.position = position;
    viewerMarkerRef.current.popupHtml = popupHtml;
    layoutProfileMarkers([...profileMarkerEntriesRef.current.values()], separateOverlappingPins);
  }, [mapReady, viewerCoords?.lat, viewerCoords?.lng, viewerAddress, currentUserId, uniqueFarmers, uniqueBuyers, uniqueStakeholders, farmerCoordsById, buyerCoordsById, stakeholderCoordsById, separateOverlappingPins]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    const signature = JSON.stringify(uniqueBuyers.map((buyer) => {
      const coords = buyerCoordsById[buyer.id];
      return [getRoleMarkerKey('buyer', buyer.id), buyer, coords];
    })) + `:${currentUserGreen}`;
    if (signature === markerSignaturesRef.current.buyers) return;
    markerSignaturesRef.current.buyers = signature;

    const remainingEntries = new Map(buyerMarkersRef.current.map((entry) => [entry.userId, entry]));
    const nextEntries = [];
    uniqueBuyers.forEach((buyer) => {
      const coords = buyerCoordsById[buyer.id];
      if (!coords) return;

      const isYou = Boolean(currentUserId && String(buyer.id) === String(currentUserId));
      const zIndex = isYou && currentUserGreen ? 1000 : undefined;
      const displayName = isYou ? `${buyer.name} (You)` : buyer.name;
      const popupHtml = buildMapPopup({
          name: displayName,
          municipality: buyer.municipality,
          address: buyer.address,
          barangay: buyer.barangay,
          coords,
          contactNumber: buyer.contactNumber,
          presence: buildPresenceMarkup(buyer),
          precision: PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback,
          links: isYou ? [] : [{ href: `/messages/direct/${buyer.id}`, label: 'Contact buyer' }],
        });
      const existing = remainingEntries.get(String(buyer.id));
      if (existing) {
        existing.marker.setPosition(coords);
        existing.marker.setMap(map);
        existing.marker.setIcon(buildBuyerMapMarkerIcon(mapsApi, { isYou, currentUserGreen }));
        existing.marker.setTitle(displayName);
        existing.marker.setZIndex(zIndex ?? null);
        existing.baseZIndex = zIndex ?? null;
        existing.icon = buildBuyerMapMarkerIcon(mapsApi, { isYou, currentUserGreen });
        existing.layoutAnchor = null;
        existing.isCurrentUser = isYou;
        existing.infoWindow.setContent(popupHtml);
        existing.position = coords;
        existing.title = displayName;
        existing.popupHtml = popupHtml;
        nextEntries.push(existing);
        remainingEntries.delete(String(buyer.id));
      } else {
        const marker = new mapsApi.Marker({
          position: coords,
          map,
          icon: buildBuyerMapMarkerIcon(mapsApi, { isYou, currentUserGreen }),
          title: buyer.name,
          zIndex,
        });
        if (isYou) marker.setTitle(displayName);
        const infoWindow = new mapsApi.InfoWindow({ content: popupHtml });
        nextEntries.push(createProfileMarkerEntry({
          role: 'buyer',
          userId: buyer.id,
          title: displayName,
          marker,
          infoWindow,
          popupHtml,
          position: coords,
          icon: buildBuyerMapMarkerIcon(mapsApi, { isYou, currentUserGreen }),
          isCurrentUser: isYou,
        }, map, mapsApi, profileMarkerEntriesRef, openProfileInfoWindowRef));
      }
    });
    remainingEntries.forEach((entry) => removeProfileMarkerEntry(entry, profileMarkerEntriesRef));
    buyerMarkersRef.current = nextEntries;
    layoutProfileMarkers([...profileMarkerEntriesRef.current.values()], separateOverlappingPins);
    refreshOpenProfileInfoWindow(map, mapsApi, profileMarkerEntriesRef, openProfileInfoWindowRef);
  }, [mapReady, uniqueBuyers, buyerCoordsById, currentUserId, currentUserGreen, separateOverlappingPins]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    const signature = JSON.stringify(uniqueStakeholders.map((stakeholder) => {
      const coords = stakeholderCoordsById[stakeholder.id];
      return [getRoleMarkerKey('stakeholder', stakeholder.id), stakeholder, coords];
    })) + `:${currentUserGreen}`;
    if (signature === markerSignaturesRef.current.stakeholders) return;
    markerSignaturesRef.current.stakeholders = signature;

    const remainingEntries = new Map(stakeholderMarkersRef.current.map((entry) => [entry.userId, entry]));
    const nextEntries = [];
    uniqueStakeholders.forEach((stakeholder) => {
      const coords = stakeholderCoordsById[stakeholder.id];
      if (!coords) return;
      const isYou = Boolean(currentUserId && String(stakeholder.id) === String(currentUserId));
      const zIndex = isYou && currentUserGreen ? 1000 : undefined;
      const orgName = stakeholder.organizationName || stakeholder.name;
      const displayName = isYou ? `${orgName} (You)` : orgName;
      const popupHtml = buildMapPopup({
          name: displayName,
          person: stakeholder.contactPerson,
          municipality: stakeholder.municipality,
          address: stakeholder.address,
          barangay: stakeholder.barangay,
          coords,
          contactNumber: stakeholder.contactNumber,
          presence: buildPresenceMarkup(stakeholder),
          precision: PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback,
          links: isYou ? [] : [{ href: `/messages/direct/${stakeholder.id}`, label: 'Contact stakeholder' }],
        });
      const existing = remainingEntries.get(String(stakeholder.id));
      if (existing) {
        existing.marker.setPosition(coords);
        existing.marker.setMap(map);
        existing.marker.setIcon(buildStakeholderMapMarkerIcon(mapsApi, { isYou, currentUserGreen }));
        existing.marker.setTitle(displayName);
        existing.marker.setZIndex(zIndex ?? null);
        existing.baseZIndex = zIndex ?? null;
        existing.icon = buildStakeholderMapMarkerIcon(mapsApi, { isYou, currentUserGreen });
        existing.layoutAnchor = null;
        existing.isCurrentUser = isYou;
        existing.infoWindow.setContent(popupHtml);
        existing.position = coords;
        existing.title = displayName;
        existing.popupHtml = popupHtml;
        nextEntries.push(existing);
        remainingEntries.delete(String(stakeholder.id));
      } else {
        const marker = new mapsApi.Marker({
          position: coords,
          map,
          icon: buildStakeholderMapMarkerIcon(mapsApi, { isYou, currentUserGreen }),
          title: displayName,
          zIndex,
        });
        const infoWindow = new mapsApi.InfoWindow({ content: popupHtml });
        nextEntries.push(createProfileMarkerEntry({
          role: 'stakeholder',
          userId: stakeholder.id,
          title: displayName,
          marker,
          infoWindow,
          popupHtml,
          position: coords,
          icon: buildStakeholderMapMarkerIcon(mapsApi, { isYou, currentUserGreen }),
          isCurrentUser: isYou,
        }, map, mapsApi, profileMarkerEntriesRef, openProfileInfoWindowRef));
      }
    });
    remainingEntries.forEach((entry) => removeProfileMarkerEntry(entry, profileMarkerEntriesRef));
    stakeholderMarkersRef.current = nextEntries;
    layoutProfileMarkers([...profileMarkerEntriesRef.current.values()], separateOverlappingPins);
    refreshOpenProfileInfoWindow(map, mapsApi, profileMarkerEntriesRef, openProfileInfoWindowRef);
  }, [mapReady, uniqueStakeholders, stakeholderCoordsById, currentUserId, currentUserGreen, separateOverlappingPins]);

  useEffect(() => {
    routes.forEach((route) => {
      const { origin, destination } = resolveRoutePoints(route);

      const key = `${pointKey(origin)}|${pointKey(destination)}`;
      if (requestedRouteKeysRef.current.has(key)) return;
      requestedRouteKeysRef.current.add(key);

      fetchRoadRoute(origin, destination).then((result) => {
        if (!result) {
          requestedRouteKeysRef.current.delete(key);
          return;
        }
        setRoadGeometries((previous) => ({ ...previous, [key]: result.points }));
      });
    });
  }, [routes]);










  useEffect(() => {
    routes.forEach((route) => {
      if (!route.currentPosition) return;
      const { origin, destination, isPickup } = resolveRoutePoints(route);
      const travelTarget = isPickup ? origin : destination;

      const meta = liveRouteMetaRef.current[route.id];
      const now = Date.now();

      if (meta) {
        const elapsed = now - meta.fetchedAt;
        const movedKm = haversineKm(meta.fetchedFrom, route.currentPosition);
        const deviationKm = distanceToPolylineKm(route.currentPosition, meta.points);
        const dueForRoutineRefresh = elapsed > LIVE_REROUTE_MIN_INTERVAL_MS && movedKm > LIVE_REROUTE_MIN_MOVE_KM;
        const dueForDeviationReroute = deviationKm > LIVE_REROUTE_DEVIATION_KM && elapsed > LIVE_REROUTE_DEVIATION_COOLDOWN_MS;
        if (!dueForRoutineRefresh && !dueForDeviationReroute) return;
      }

      if (pendingLiveFetchRef.current.has(route.id)) return;
      pendingLiveFetchRef.current.add(route.id);

      fetchRoadRoute(route.currentPosition, travelTarget, { skipCache: true }).then((result) => {
        pendingLiveFetchRef.current.delete(route.id);
        if (!result) return;
        liveRouteMetaRef.current = {
          ...liveRouteMetaRef.current,
          [route.id]: { fetchedAt: Date.now(), fetchedFrom: route.currentPosition, points: result.points },
        };
        setLiveRouteGeometries((previous) => ({
          ...previous,
          [route.id]: { points: result.points, distanceKm: result.distanceKm, durationMinutes: result.durationMinutes },
        }));
      });
    });
  }, [routes]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    routeLayerRef.current.forEach((layer) => layer.setMap(null));
    routeLayerRef.current = [];
    let allPoints = [];
    const truckRouteIdsThisRender = new Set();

    routes.forEach((route) => {
      const { origin, destination, isPickup } = resolveRoutePoints(route);

      const originMarker = new mapsApi.Marker({ position: origin, map, icon: buildPinIcon(mapsApi, MAP_COLORS.origin), title: route.originLabel });
      routeLayerRef.current.push(originMarker);
      allPoints.push(origin);

      const destinationMarker = new mapsApi.Marker({ position: destination, map, icon: buildPinIcon(mapsApi, MAP_COLORS.destination), title: route.destinationLabel });
      routeLayerRef.current.push(destinationMarker);
      allPoints.push(destination);
      if (route.currentPosition) allPoints.push(route.currentPosition);






      const travelTarget = isPickup ? origin : destination;
      const isLiveNavigating = Boolean(route.currentPosition);
      const liveRoute = isLiveNavigating ? liveRouteGeometries[route.id] : null;
      const staticRoadPoints = roadGeometries[`${pointKey(origin)}|${pointKey(destination)}`];
      const pathPoints = liveRoute?.points?.length > 1
        ? liveRoute.points
        : isLiveNavigating
          ? [route.currentPosition, travelTarget]
          : (staticRoadPoints?.length > 1 ? staticRoadPoints : [origin, destination]);




      const casing = new mapsApi.Polyline({ path: pathPoints, strokeColor: '#ffffff', strokeWeight: 8, strokeOpacity: 0.9, map });
      routeLayerRef.current.push(casing);
      const routeLine = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_LINE_COLOR, strokeWeight: 5, strokeOpacity: 0.95, map });
      routeLayerRef.current.push(routeLine);





      const truckPosition = route.currentPosition || pointAlongRoute(pathPoints, route.progress);
      if (!truckPosition) return;
      truckRouteIdsThisRender.add(route.id);

      const popupText = route.label || `${route.originLabel} → ${route.destinationLabel}`;
      const etaText = route.etaMinutes != null ? `<br/><small>ETA ~${route.etaMinutes} min${route.etaMinutes === 1 ? '' : 's'}</small>` : '';
      const distanceText = route.remainingKm != null ? `<br/><small>${route.remainingKm.toFixed(1)} km remaining</small>` : '';
      const positionSourceText = `<br/><small>${route.currentPosition ? '📍 Live GPS location' : 'Estimated position'}</small>`;
      const infoHtml = (route.href ? `<a href="${route.href}">${popupText}</a>` : popupText) + etaText + distanceText + positionSourceText;






      let entry = truckMarkersRef.current[route.id];
      if (!entry) {
        const marker = new mapsApi.Marker({ position: truckPosition, map, icon: buildTruckIcon(mapsApi) });
        const infoWindow = new mapsApi.InfoWindow();
        entry = { marker, infoWindow, infoHtml, animationFrameId: null };
        marker.addListener('click', () => {
          infoWindow.setContent(entry.infoHtml);
          infoWindow.open({ map, anchor: marker });
        });
        truckMarkersRef.current[route.id] = entry;
      } else {
        entry.marker.setMap(map);
        entry.infoHtml = infoHtml;
        animateMarkerTo(entry, truckPosition);
      }
    });



    Object.keys(truckMarkersRef.current).forEach((routeId) => {
      if (truckRouteIdsThisRender.has(routeId)) return;
      const entry = truckMarkersRef.current[routeId];
      if (entry.animationFrameId != null) cancelAnimationFrame(entry.animationFrameId);
      entry.marker.setMap(null);
      delete truckMarkersRef.current[routeId];
    });





    Object.values(farmerCoordsById).forEach((coords) => allPoints.push(coords));
    Object.values(buyerCoordsById).forEach((coords) => allPoints.push(coords));
    Object.values(stakeholderCoordsById).forEach((coords) => allPoints.push(coords));
    const viewerLat = Number(viewerCoords?.lat);
    const viewerLng = Number(viewerCoords?.lng);
    const viewerPoint = validateCoordinates(viewerCoords?.lat, viewerCoords?.lng);
    if (nearbyView && viewerPoint) {
      allPoints = nearbyMapPoints(viewerPoint, uniqueFarmers.map((farmer) => farmerCoordsById[farmer.id]).filter(Boolean));
    } else if (viewerPoint) {
      allPoints.push({ lat: viewerLat, lng: viewerLng });
    } else if (viewerMunicipality && !nearbyView) {
      allPoints.push(getMunicipalityCoords(viewerMunicipality));
    }





    const signature = [
      routes.map((route) => route.id).sort().join(','),
      uniqueFarmers.map((farmer) => getRoleMarkerKey('farmer', farmer.id)).sort().join(','),
      uniqueBuyers.map((buyer) => getRoleMarkerKey('buyer', buyer.id)).sort().join(','),
      uniqueStakeholders.map((stakeholder) => getRoleMarkerKey('stakeholder', stakeholder.id)).sort().join(','),
      Number.isFinite(viewerLat) && Number.isFinite(viewerLng) ? `${viewerLat.toFixed(5)},${viewerLng.toFixed(5)}` : '',
      viewerMunicipality || '',
      nearbyView ? allPoints.map((point) => `${point.lat},${point.lng}`).join(';') : '',
    ].join('|');
    if (signature === fittedSignatureRef.current) return;
    fittedSignatureRef.current = signature;

    if (allPoints.length === 1) {
      map.setCenter(allPoints[0]);
      map.setZoom(13);
    } else if (allPoints.length > 1) {
      const bounds = new mapsApi.LatLngBounds();
      allPoints.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, 36);
      if (nearbyView) mapsApi.event.addListenerOnce(map, 'idle', () => {
        if (map.getZoom() > 16) map.setZoom(16);
      });
    } else if (!nearbyView) {
      map.setCenter(viewerMunicipality ? getMunicipalityCoords(viewerMunicipality) : CEBU_CENTER);
      map.setZoom(10);
    }
  }, [
    mapReady,
    routes,
    roadGeometries,
    liveRouteGeometries,
    uniqueFarmers,
    uniqueBuyers,
    uniqueStakeholders,
    farmerCoordsById,
    buyerCoordsById,
    stakeholderCoordsById,
    viewerMunicipality,
    nearbyView,
    viewerCoords?.lat,
    viewerCoords?.lng,
  ]);

  return (
    <div ref={wrapperRef} className={`delivery-map-wrapper ${isFullscreen ? 'fullscreen' : ''}`}>
      <button
        type="button"
        className="map-fullscreen-toggle"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Exit full view' : 'View map fully'}
        title={isFullscreen ? 'Exit full view' : 'View map fully'}
        aria-pressed={isFullscreen}
      >
        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
      </button>
      <div ref={containerRef} className="delivery-map" />
    </div>
  );
}
