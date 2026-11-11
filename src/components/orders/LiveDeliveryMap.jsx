import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock3, Crosshair, Gauge, MapPin, Minus, Plus, Truck } from 'lucide-react';
import { DARK_MAP_STYLE, GOOGLE_MAPS_MAP_ID, loadGoogleMaps } from '../../lib/googleMapsLoader';
import { useOrderTrackingSocket } from '../../hooks/useOrderTrackingSocket';
import { isFreshLivePosition } from '../../utils/liveTrackingPosition';
import { getRecordedAverageSpeedKmh } from '../../utils/tripTelemetry';
import { MAP_COLORS } from '../../lib/mapMarkerColors';
import { validateCoordinates } from '../../utils/geo';
import { createLiveMapCamera } from '../../utils/liveMapCamera';
import { nearestIndexOnPath } from '../../services/routingService';
import { useTrafficNavigation } from '../../hooks/useTrafficNavigation';
import TrafficRouteNotice from './TrafficRouteNotice';
import { getLiveTransitProgress } from '../../services/orderService';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';
import { useOrderConnectionStatus } from '../../hooks/useOrderConnectionStatus';
import { useTheme } from '../../contexts/ThemeContext';
import deliveryVanIcon from '../../assets/icons/harvestlink-delivery-van.png?inline';
import {
  buildVehicleMarkerSvg,
  getContinuousVehicleHeading,
  resolveVehicleHeading,
  VEHICLE_MARKER_ANIMATION_DURATION_MS,
  VEHICLE_MARKER_HEIGHT_PX,
  VEHICLE_MARKER_WIDTH_PX,
} from '../../utils/vehicleMarker';
import DriverConnectionBadge from './DriverConnectionBadge';
import LiveDeliverySummary from './LiveDeliverySummary';























const ROUTE_COLOR = '#1a73e8';
const ROUTE_TRAVELED_COLOR = '#9aa0a6';
const ROUTE_DELIVERED_COLOR = '#16a34a';
const ROUTE_SHADOW_COLOR = '#4c1d95';
const ROUTE_ALT_COLOR = '#c7cbd1';

const ARRIVED_KM_THRESHOLD = 0.03;











function buildDotIcon(mapsApi, color) {
  const svg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="12" cy="12" r="9" fill="${color}" stroke="white" stroke-width="3"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(24, 24),
    anchor: new mapsApi.Point(12, 12),
  };
}

function buildDestinationPinIcon(mapsApi, color = '#e33129') {
  const svg = '<svg width="32" height="56" viewBox="0 0 24 42" xmlns="http://www.w3.org/2000/svg">'
    + '<path d="M12 20v20" stroke="#596584" stroke-width="3" stroke-linecap="round"/>'
    + `<circle cx="12" cy="11" r="10" fill="${color}"/>`
    + '<circle cx="8.5" cy="8" r="2.2" fill="#ff6668"/></svg>';
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(32, 56),
    anchor: new mapsApi.Point(16, 56),
  };
}







function buildVehicleMarkerContent() {
  const wrapper = document.createElement('div');
  wrapper.className = 'nav-vehicle-marker';
  wrapper.innerHTML = buildVehicleMarkerSvg(deliveryVanIcon);
  return wrapper;
}

function updateVehicleHeading(content, headingDeg) {
  const vehicleBody = content.querySelector('[data-vehicle-body]');
  if (!vehicleBody || !Number.isFinite(headingDeg)) return;
  vehicleBody.removeAttribute('transform');
  vehicleBody.style.transform = `rotate(${headingDeg}deg)`;
}







function buildVehicleIcon(mapsApi, headingDeg, previousHeadingDeg) {
  const svg = buildVehicleMarkerSvg(deliveryVanIcon, headingDeg, previousHeadingDeg);
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(VEHICLE_MARKER_WIDTH_PX, VEHICLE_MARKER_HEIGHT_PX),
    anchor: new mapsApi.Point(VEHICLE_MARKER_WIDTH_PX / 2, VEHICLE_MARKER_HEIGHT_PX / 2),
  };
}





function setVehicleMarkerMap(entry, map) {
  if (!entry) return;
  if (entry.kind === 'advanced') entry.marker.map = map;
  else entry.marker.setMap(map);
}

function setVehicleMarkerPosition(entry, position) {
  if (entry.kind === 'advanced') entry.marker.position = position;
  else entry.marker.setPosition(position);
  entry.currentLatLng = position;
}

function setVehicleMarkerHeading(entry, mapsApi, headingDeg) {
  const currentHeading = entry.renderedHeading ?? headingDeg;
  const renderedHeading = getContinuousVehicleHeading(currentHeading, headingDeg);
  entry.renderedHeading = renderedHeading;
  if (entry.kind === 'advanced') updateVehicleHeading(entry.content, renderedHeading);
  else entry.marker.setIcon(buildVehicleIcon(mapsApi, renderedHeading, currentHeading));
}










function estimatedArrivalLabel(etaMinutes) {
  if (etaMinutes == null) return '—';
  return new Date(Date.now() + etaMinutes * 60000).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}






function animateMarkerTo(entry, targetPosition, durationMs = VEHICLE_MARKER_ANIMATION_DURATION_MS) {
  if (entry.animationFrameId != null) cancelAnimationFrame(entry.animationFrameId);
  const start = entry.currentLatLng || targetPosition;
  const startTime = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - startTime) / durationMs);
    const next = {
      lat: start.lat + (targetPosition.lat - start.lat) * t,
      lng: start.lng + (targetPosition.lng - start.lng) * t,
    };
    setVehicleMarkerPosition(entry, next);
    entry.animationFrameId = t < 1 ? requestAnimationFrame(step) : null;
  };
  entry.animationFrameId = requestAnimationFrame(step);
}

export default function LiveDeliveryMap({
  order,
  farmerProfile,
  buyerProfile,
  destinationMunicipalityOverride,
  onRouteUpdate,
  deliveryStatusBadge,
  deliveryStatusSummary,
  canChooseAlternative = false,
  navigationEnabled = true,
  sharerLabelOverride,
  moverMarkerType = 'vehicle',
  requireLivePosition = false,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapsApiRef = useRef(null);
  const trafficLayerRef = useRef(null);
  const layerRef = useRef([]);
  const routeLineRef = useRef(null);
  const casingLineRef = useRef(null);
  const shadowLineRef = useRef(null);
  const carEntryRef = useRef(null);
  const cameraRef = useRef(null);
  const liveTargetRef = useRef(null);
  const overviewStateRef = useRef(null);
  const vehicleHeadingRef = useRef(0);
  const lastVehicleHeadingPositionRef = useRef(null);
  const autoEnabledRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [autoFollow, setAutoFollow] = useState(false);
  const [trafficAvailable, setTrafficAvailable] = useState(false);
  const [trafficOverride, setTrafficOverride] = useState(null);

  const hasVectorMap = Boolean(GOOGLE_MAPS_MAP_ID);
  const { effectiveTheme } = useTheme();

  const destinationMunicipality = destinationMunicipalityOverride || order.deliveryMunicipality;

  const people = useMemo(() => [
    {
      id: order.farmerId,
      latitude: farmerProfile?.latitude,
      longitude: farmerProfile?.longitude,
      address: farmerProfile?.address,
      municipality: order.originMunicipality,
    },
    {
      id: order.buyerId,
      latitude: buyerProfile?.latitude,
      longitude: buyerProfile?.longitude,
      address: buyerProfile?.address,
      municipality: destinationMunicipality,
    },
  ], [
    order.farmerId,
    order.buyerId,
    farmerProfile?.latitude,
    farmerProfile?.longitude,
    farmerProfile?.address,
    buyerProfile?.latitude,
    buyerProfile?.longitude,
    buyerProfile?.address,
    order.originMunicipality,
    destinationMunicipality,
  ]);
  const coordsById = useMapCoordinates(people, { registeredOnly: true });
  const origin = coordsById[order.farmerId];
  const destination = coordsById[order.buyerId];
  const isPickup = order.deliveryMethod === 'buyer_pickup';
  const isCourier = order.deliveryMethod === 'courier';
  const travelOrigin = isPickup ? destination : origin;
  const travelDestination = isPickup ? origin : destination;
  const sharerLabel = sharerLabelOverride || (isPickup ? 'Buyer' : 'Driver');
  const { livePosition } = useOrderTrackingSocket(isCourier ? null : order.id, order);
  const lastLocationUpdatedAt = livePosition?.locationUpdatedAt || order.locationUpdatedAt;
  const connectionStatus = useOrderConnectionStatus(order.id, { active: !isCourier, lastUpdateAt: lastLocationUpdatedAt });

  const transit = getLiveTransitProgress(order, { origin, destination });
  const isDelivered = order.status === 'completed';
  const currentPosition = transit.isInTransit && livePosition && isFreshLivePosition(livePosition) ? livePosition : null;
  const vehiclePosition = currentPosition;
  // Keep the saved-origin fallback for normal delivery maps, but never present it as a live
  // Stakeholder position before a GPS fix has been shared.
  const markerPosition = transit.isInTransit
    ? validateCoordinates(livePosition?.lat, livePosition?.lng) || (requireLivePosition ? null : travelOrigin)
    : null;
  const deliveryState = isDelivered ? 'delivered' : (transit.isInTransit ? 'navigating' : 'preview');
  const initialCenter = validateCoordinates(vehiclePosition?.lat, vehiclePosition?.lng) || origin || destination;
  const recenterTarget = validateCoordinates(vehiclePosition?.lat, vehiclePosition?.lng)
    || validateCoordinates(livePosition?.lat, livePosition?.lng);
  const canRecenter = mapReady && Boolean(recenterTarget);
  const recenterSubject = sharerLabel.toLowerCase();
  const recenterLabel = !mapReady ? 'Loading map'
    : !canRecenter ? `Waiting for ${recenterSubject} location`
      : autoFollow ? `Following ${recenterSubject}` : `Re-center on ${recenterSubject}`;

  const trafficEnabled = moverMarkerType !== 'pin' && (trafficOverride ?? (deliveryState === 'navigating'));
  const navigation = useTrafficNavigation({
    orderId: order.id,
    origin: travelOrigin,
    destination: travelDestination,
    position: currentPosition,
    locationUpdatedAt: lastLocationUpdatedAt,
    active: transit.isInTransit,
    enabled: navigationEnabled,
  });
  const googleRoute = navigation.selected;
  const remainingKm = currentPosition && !navigation.stale ? googleRoute?.distanceKm ?? null : null;
  const currentSpeedKmh = currentPosition && isFreshLivePosition(currentPosition) && Number.isFinite(currentPosition.speed)
    ? Math.max(0, currentPosition.speed * 3.6)
    : null;
  const etaMinutes = currentPosition && !navigation.stale && googleRoute?.durationMinutes != null ? Math.max(0, Math.round(googleRoute.durationMinutes)) : null;
  const arrivalLabel = estimatedArrivalLabel(isDelivered ? null : etaMinutes);
  const completedAverageSpeedKmh = getRecordedAverageSpeedKmh(order);
  const isArrived = !isDelivered && remainingKm != null && remainingKm <= ARRIVED_KM_THRESHOLD;
  const etaCardValue = isDelivered ? 'Delivered' : isArrived ? 'Arrived' : (etaMinutes != null ? `${etaMinutes} min${etaMinutes === 1 ? '' : 's'}` : '—');
  const distanceCardValue = isDelivered
    ? '0.0 km'
    : remainingKm != null
      ? `${remainingKm.toFixed(1)} km`
      : '—';
  const speedCardValue = isDelivered
    ? (completedAverageSpeedKmh != null ? `${completedAverageSpeedKmh.toFixed(1)} km/h avg` : '—')
    : (currentSpeedKmh != null ? `${currentSpeedKmh.toFixed(0)} km/h` : '—');
  const adjustMapZoom = (change) => {
    const map = mapRef.current;
    const zoom = map?.getZoom?.();
    if (!Number.isFinite(zoom) || typeof map.setZoom !== 'function') return;
    map.setZoom(Math.max(3, Math.min(21, zoom + change)));
  };

  useEffect(() => {
    if (!isDelivered) onRouteUpdate?.({ etaMinutes, remainingKm, currentSpeedKmh, isInTransit: Boolean(currentPosition) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etaMinutes, remainingKm, currentSpeedKmh, currentPosition?.lat, currentPosition?.lng, isDelivered]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !initialCenter) return undefined;
    let cancelled = false;
    loadGoogleMaps().then((mapsApi) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = new mapsApi.Map(containerRef.current, {
        center: initialCenter,
        zoom: 12,
        mapId: GOOGLE_MAPS_MAP_ID || undefined,
        disableDefaultUI: true,
        zoomControl: false,
        gestureHandling: 'greedy',



        styles: hasVectorMap ? undefined : (effectiveTheme === 'dark' ? DARK_MAP_STYLE : []),
      });
      mapRef.current = map;
      mapsApiRef.current = mapsApi;
      if (typeof mapsApi.TrafficLayer === 'function') {
        trafficLayerRef.current = new mapsApi.TrafficLayer();
        setTrafficAvailable(true);
      }
      setMapReady(true);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
    // Live GPS can initialize the map even when registered profile coordinates are missing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCenter?.lat, initialCenter?.lng, effectiveTheme, hasVectorMap]);

  useEffect(() => {
    liveTargetRef.current = vehiclePosition
      || validateCoordinates(livePosition?.lat, livePosition?.lng);
  }, [vehiclePosition, livePosition?.lat, livePosition?.lng]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !mapsApiRef.current) return undefined;
    const camera = createLiveMapCamera({
      map: mapRef.current,
      mapsApi: mapsApiRef.current,
      container: containerRef.current,
      getPosition: () => liveTargetRef.current,
      getHeading: () => vehicleHeadingRef.current,
      onFollowChange: setAutoFollow,
    });
    cameraRef.current = camera;
    return () => {
      camera.destroy();
      cameraRef.current = null;
    };
  }, [mapReady]);

  useEffect(() => {
    if (!navigationEnabled || !mapReady) return undefined;
    const frame = requestAnimationFrame(() => {
      cameraRef.current?.resize();
      if (liveTargetRef.current) {
        autoEnabledRef.current = cameraRef.current?.resume() || false;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [navigationEnabled, mapReady]);



  useEffect(() => {
    if (!mapReady || !mapRef.current || hasVectorMap) return;
    mapRef.current.setOptions({ styles: effectiveTheme === 'dark' ? DARK_MAP_STYLE : [] });
  }, [effectiveTheme, mapReady, hasVectorMap]);

  useEffect(() => {
    if (!mapReady || !trafficLayerRef.current) return;
    trafficLayerRef.current.setMap(trafficEnabled ? mapRef.current : null);
  }, [mapReady, trafficEnabled]);

  useEffect(() => () => {
    trafficLayerRef.current?.setMap(null);
  }, []);














  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi || !origin || !destination) return;

    layerRef.current.forEach((layer) => layer.setMap(null));
    layerRef.current = [];
    routeLineRef.current = null;
    casingLineRef.current = null;
    shadowLineRef.current = null;

    const originMarker = new mapsApi.Marker({ position: origin, map, icon: buildDotIcon(mapsApi, MAP_COLORS.origin), title: order.farmerName });
    const destinationMarker = new mapsApi.Marker({ position: destination, map, icon: buildDestinationPinIcon(mapsApi), title: order.buyerName });
    layerRef.current.push(originMarker, destinationMarker);

    const pathPoints = googleRoute?.points || [];
    const fitToBothPins = () => {
      const bounds = new mapsApi.LatLngBounds();
      bounds.extend(origin);
      bounds.extend(destination);
      if (vehiclePosition) bounds.extend(vehiclePosition);
      else if (markerPosition) bounds.extend(markerPosition);
      cameraRef.current?.fitOverview(bounds);
    };

    if (moverMarkerType === 'pin') {
      if (overviewStateRef.current !== deliveryState) {
        overviewStateRef.current = deliveryState;
        fitToBothPins();
      }
      return;
    }

    if (deliveryState === 'preview') {
      const shadow = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_SHADOW_COLOR, strokeWeight: 12, strokeOpacity: 0.16, geodesic: true, map, zIndex: 90 });
      const casing = new mapsApi.Polyline({ path: pathPoints, strokeColor: '#ffffff', strokeWeight: 8, strokeOpacity: 0.9, geodesic: true, map, zIndex: 99 });
      const routeLine = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_COLOR, strokeWeight: 5, strokeOpacity: 0.95, geodesic: true, map, zIndex: 100 });
      layerRef.current.push(shadow, casing, routeLine);
      setVehicleMarkerMap(carEntryRef.current, null);
      cameraRef.current?.pause();
      map.setTilt(0);
      map.setHeading(0);
    } else if (deliveryState === 'delivered') {
      const shadow = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_SHADOW_COLOR, strokeWeight: 12, strokeOpacity: 0.16, geodesic: true, map, zIndex: 90 });
      const casing = new mapsApi.Polyline({ path: pathPoints, strokeColor: '#ffffff', strokeWeight: 8, strokeOpacity: 0.9, geodesic: true, map, zIndex: 99 });
      const routeLine = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_DELIVERED_COLOR, strokeWeight: 5, strokeOpacity: 0.95, geodesic: true, map, zIndex: 100 });
      layerRef.current.push(shadow, casing, routeLine);
      setVehicleMarkerMap(carEntryRef.current, null);
      cameraRef.current?.pause();
      map.setTilt(0);
      map.setHeading(0);
    } else {



      const shadow = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_SHADOW_COLOR, strokeWeight: 13, strokeOpacity: 0.18, geodesic: true, map, zIndex: 90 });
      shadowLineRef.current = shadow;
      layerRef.current.push(shadow);

      (navigation.alternatives || []).forEach(({ points: altPoints }) => {
        const alt = new mapsApi.Polyline({ path: altPoints, strokeColor: ROUTE_ALT_COLOR, strokeWeight: 4, strokeOpacity: 0.85, geodesic: true, map, zIndex: 95 });
        layerRef.current.push(alt);
      });

      const casing = new mapsApi.Polyline({ path: pathPoints, strokeColor: '#ffffff', strokeWeight: 10, strokeOpacity: 0.95, geodesic: true, map, zIndex: 99 });
      casingLineRef.current = casing;
      layerRef.current.push(casing);



      const routeLine = new mapsApi.Polyline({
        path: pathPoints,
        strokeColor: ROUTE_COLOR,
        strokeWeight: 7,
        strokeOpacity: 1,
        geodesic: true,
        map,
        zIndex: 100,
      });
      routeLineRef.current = routeLine;
      layerRef.current.push(routeLine);




      let travelIndex = 0;
      if (vehiclePosition) {
        travelIndex = nearestIndexOnPath(vehiclePosition, pathPoints);
        if (travelIndex > 0) {
          const traveled = pathPoints.slice(0, travelIndex + 1);
          const traveledLine = new mapsApi.Polyline({ path: traveled, strokeColor: ROUTE_TRAVELED_COLOR, strokeWeight: 7, strokeOpacity: 0.9, geodesic: true, map, zIndex: 101 });
          layerRef.current.push(traveledLine);
        }
      }

      if (pathPoints.length > 1) {
      const startCap = new mapsApi.Circle({ center: pathPoints[0], radius: 5, strokeWeight: 0, fillColor: ROUTE_TRAVELED_COLOR, fillOpacity: 0.9, map, zIndex: 102, clickable: false });
      const endCapColor = travelIndex >= pathPoints.length - 1 ? ROUTE_TRAVELED_COLOR : ROUTE_COLOR;
      const endCap = new mapsApi.Circle({ center: pathPoints[pathPoints.length - 1], radius: 5, strokeWeight: 0, fillColor: endCapColor, fillOpacity: 1, map, zIndex: 102, clickable: false });
      layerRef.current.push(startCap, endCap);

      }

    }
    if (overviewStateRef.current !== deliveryState) {
      overviewStateRef.current = deliveryState;
      fitToBothPins();
    }
    // GPS updates move the marker independently; route changes do not reset the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, googleRoute, navigation.alternatives, origin?.lat, origin?.lng, destination?.lat, destination?.lng, deliveryState, moverMarkerType]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;
    if (deliveryState !== 'navigating' || !validateCoordinates(markerPosition?.lat, markerPosition?.lng)) {
      setVehicleMarkerMap(carEntryRef.current, null);
      cameraRef.current?.pause();
      autoEnabledRef.current = false;
      return;
    }
    if (moverMarkerType === 'pin') {
      if (carEntryRef.current && carEntryRef.current.kind !== 'pin') {
        if (carEntryRef.current.animationFrameId != null) cancelAnimationFrame(carEntryRef.current.animationFrameId);
        setVehicleMarkerMap(carEntryRef.current, null);
        carEntryRef.current = null;
      }
      if (!carEntryRef.current) {
        const marker = new mapsApi.Marker({
          position: markerPosition,
          map,
          icon: buildDestinationPinIcon(mapsApi, '#16834b'),
          title: `${sharerLabel} live location`,
          zIndex: 1000,
        });
        carEntryRef.current = { kind: 'pin', marker, currentLatLng: markerPosition };
      } else {
        setVehicleMarkerMap(carEntryRef.current, map);
        setVehicleMarkerPosition(carEntryRef.current, markerPosition);
      }
      cameraRef.current?.pause();
      autoEnabledRef.current = false;
      return;
    }
    if (carEntryRef.current?.kind === 'pin') {
      setVehicleMarkerMap(carEntryRef.current, null);
      carEntryRef.current = null;
    }
    const vehicleHeading = resolveVehicleHeading({
      previousPosition: lastVehicleHeadingPositionRef.current,
      currentPosition: markerPosition,
      lastHeading: vehicleHeadingRef.current,
      deviceHeading: markerPosition.deviceHeading,
      gpsHeading: markerPosition.heading,
    });
    vehicleHeadingRef.current = vehicleHeading.heading;
    if (vehicleHeading.shouldUpdateReference) lastVehicleHeadingPositionRef.current = markerPosition;

    if (!carEntryRef.current) {

      if (hasVectorMap && typeof mapsApi.AdvancedMarkerElement === 'function') {
        const content = buildVehicleMarkerContent();
        updateVehicleHeading(content, vehicleHeadingRef.current);
        const marker = new mapsApi.AdvancedMarkerElement({
          position: markerPosition,
          map,
          content,
          anchorLeft: '-50%',
          anchorTop: '-50%',
          zIndex: 1000,
        });
        carEntryRef.current = {
          kind: 'advanced',
          marker,
          content,
          currentLatLng: markerPosition,
          renderedHeading: vehicleHeadingRef.current,
          animationFrameId: null,
        };
      } else {
        const marker = new mapsApi.Marker({ position: markerPosition, map, icon: buildVehicleIcon(mapsApi, vehicleHeadingRef.current), zIndex: 1000 });
        carEntryRef.current = {
          kind: 'classic',
          marker,
          currentLatLng: markerPosition,
          renderedHeading: vehicleHeadingRef.current,
          animationFrameId: null,
        };
      }
    } else {
      setVehicleMarkerMap(carEntryRef.current, map);
      setVehicleMarkerHeading(carEntryRef.current, mapsApi, vehicleHeadingRef.current);
      animateMarkerTo(carEntryRef.current, markerPosition);
    }
    if (vehiclePosition && googleRoute?.points?.length > 1) {
      const travelIndex = nearestIndexOnPath(vehiclePosition, googleRoute.points);
      const remainingPath = [vehiclePosition, ...googleRoute.points.slice(Math.max(1, travelIndex + 1))];
      routeLineRef.current?.setPath?.(remainingPath);
      casingLineRef.current?.setPath?.(remainingPath);
      shadowLineRef.current?.setPath?.(remainingPath);
    }
    if (!autoEnabledRef.current) {
      // Only auto-follow the camera when GPS is fresh (currentPosition), not on stale fixes.
      if (currentPosition) autoEnabledRef.current = cameraRef.current?.resume() || false;
    } else {
      cameraRef.current?.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mapReady,
    markerPosition?.lat,
    markerPosition?.lng,
    markerPosition?.heading,
    markerPosition?.deviceHeading,
    deliveryState,
    moverMarkerType,
    requireLivePosition,
    sharerLabel,
  ]);

  useEffect(() => () => {
    cameraRef.current?.destroy();
    if (carEntryRef.current?.animationFrameId != null) cancelAnimationFrame(carEntryRef.current.animationFrameId);
    setVehicleMarkerMap(carEntryRef.current, null);
    carEntryRef.current = null;
    layerRef.current.forEach((layer) => layer.setMap(null));
    layerRef.current = [];
    routeLineRef.current = null;
    casingLineRef.current = null;
    shadowLineRef.current = null;
    mapRef.current = null;
    mapsApiRef.current = null;
  }, []);

  return (
    <div className="live-delivery-map-wrap">
      {moverMarkerType !== 'pin' ? (
        <TrafficRouteNotice navigation={navigation} allowChoice={canChooseAlternative && transit.isInTransit} />
      ) : null}
      <div className="nav-map-container">
        <div ref={containerRef} className="live-delivery-map" />
        <div className="nav-map-zoom-controls" role="group" aria-label="Map zoom controls">
          <button type="button" onClick={(event) => { event.stopPropagation(); adjustMapZoom(1); }} disabled={!mapReady} aria-label="Zoom in" title="Zoom in">
            <Plus size={22} aria-hidden="true" />
          </button>
          <button type="button" onClick={(event) => { event.stopPropagation(); adjustMapZoom(-1); }} disabled={!mapReady} aria-label="Zoom out" title="Zoom out">
            <Minus size={22} aria-hidden="true" />
          </button>
        </div>

        {trafficAvailable && moverMarkerType !== 'pin' ? (
          <button
            type="button"
            className={`nav-traffic-toggle${trafficEnabled ? ' active' : ''}`}
            aria-pressed={trafficEnabled}
            onClick={(event) => {
              event?.stopPropagation?.();
              setTrafficOverride((previous) => !(previous ?? (deliveryState === 'navigating')));
            }}
            title={trafficEnabled ? 'Turn traffic off' : 'Turn traffic on'}
          >
            Traffic
          </button>
        ) : null}

        {deliveryState === 'navigating' ? (
          <button
            type="button"
            className={`nav-recenter-btn ${autoFollow ? 'active' : ''}`}
            disabled={!canRecenter}
            onClick={(event) => {
              event?.stopPropagation?.();
              const map = mapRef.current;
              const target = recenterTarget || markerPosition || origin;
              if (!cameraRef.current?.zoomTo?.(17) && target && map?.panTo) {
                const currentZoom = map.getZoom?.();
                if (Number.isFinite(currentZoom) && currentZoom < 17 && typeof map.setZoom === 'function') {
                  map.setZoom(17);
                }
                map.panTo(target);
              }
            }}
            onPointerDown={(event) => {
              const target = recenterTarget || markerPosition || origin;
              if (!canRecenter && target && mapRef.current?.panTo) {
                event?.stopPropagation?.();
                const currentZoom = mapRef.current.getZoom?.();
                if (Number.isFinite(currentZoom) && currentZoom < 17 && typeof mapRef.current.setZoom === 'function') {
                  mapRef.current.setZoom(17);
                }
                mapRef.current.panTo(target);
              }
            }}
            aria-pressed={autoFollow}
            aria-label={recenterLabel}
            title={recenterLabel}
          >
            <Crosshair size={18} />
          </button>
        ) : null}

        {moverMarkerType !== 'pin' && deliveryState === 'navigating' && (connectionStatus === 'offline' || connectionStatus === 'reconnecting') ? (
          <div className="nav-map-overlay-banner">Waiting for driver connection…</div>
        ) : null}
      </div>
      {moverMarkerType !== 'pin' && deliveryState === 'navigating' && !currentPosition ? (
        <p className="tracking-live-location-unavailable" role="status">Live location is not available yet.</p>
      ) : null}

      {deliveryState === 'navigating' && order.deliveryMethod === 'farmer_delivery' ? (
        <LiveDeliverySummary
          order={order}
          eta={etaCardValue}
          distance={distanceCardValue}
          arrival={arrivalLabel}
          speed={speedCardValue}
          connectionStatus={connectionStatus}
          lastUpdatedAt={lastLocationUpdatedAt}
          deliveryStatus={deliveryStatusSummary}
          deliveryStatusBadge={deliveryStatusBadge}
        />
      ) : deliveryState === 'navigating' && moverMarkerType === 'pin' ? (
        <div className="nav-info-card donation-live-location-card">
          <div className="nav-info-card-header">
            <span className={`nav-status-dot status-${connectionStatus || 'reconnecting'}`} />
            <strong>{sharerLabel}</strong>
            <span className="nav-info-card-vehicle">
              {currentPosition ? 'Live GPS location' : 'Waiting for GPS location'}
            </span>
          </div>
          <DriverConnectionBadge status={connectionStatus} label={sharerLabel} lastUpdatedAt={lastLocationUpdatedAt} />
        </div>
      ) : deliveryState === 'navigating' ? (
        <div className="nav-info-card">
          <div className="nav-info-card-header">
            <span className={`nav-status-dot status-${connectionStatus || 'reconnecting'}`} />
            <strong>{moverMarkerType === 'pin' ? sharerLabel : isPickup ? order.buyerName : order.farmerName}</strong>
            <span className="nav-info-card-vehicle">{moverMarkerType === 'pin' ? 'Live location' : isPickup ? 'On the way to pickup' : 'Delivery vehicle'}</span>
          </div>
          <div className="nav-info-card-grid">
            <div><p>ETA</p><strong className={connectionStatus === 'online' || connectionStatus == null ? '' : 'is-paused'}>{etaCardValue}</strong></div>
            <div><p>Distance</p><strong>{distanceCardValue}</strong></div>
            <div><p>Arrival</p><strong>{arrivalLabel}</strong></div>
            <div><p>Speed</p><strong>{speedCardValue}</strong></div>
          </div>
          {deliveryStatusBadge ? <div className="nav-info-card-status">{deliveryStatusBadge}</div> : null}
          <div className="nav-info-card-gps">
            <DriverConnectionBadge status={connectionStatus} label={sharerLabel} lastUpdatedAt={lastLocationUpdatedAt} />
          </div>
        </div>
      ) : null}

      {isDelivered ? (
        <section className="tracking-completed-summary" aria-label="Completed delivery summary">
          <div className="tracking-completed-state">
            <CheckCircle2 size={20} aria-hidden="true" />
            <div>
              <strong>{etaCardValue}</strong>
              <p>Order completed successfully</p>
            </div>
          </div>
          {completedAverageSpeedKmh != null ? (
            <dl className="tracking-completed-metrics">
              <div><dt>Average speed</dt><dd>{speedCardValue.replace(/ avg$/, '')}</dd></div>
            </dl>
          ) : null}
        </section>
      ) : deliveryState !== 'navigating' ? (
        <div className="tracking-info-cards">
          <div className="tracking-info-card">
            <div className="tracking-info-card-icon"><Clock3 size={18} /></div>
            <div><p>{isDelivered ? 'Delivery' : 'ETA'}</p><strong>{etaCardValue}</strong></div>
          </div>
          <div className="tracking-info-card">
            <div className="tracking-info-card-icon"><MapPin size={18} /></div>
            <div><p>Remaining Distance</p><strong>{distanceCardValue}</strong></div>
          </div>
          <div className="tracking-info-card">
            <div className="tracking-info-card-icon"><Gauge size={18} /></div>
            <div><p>{isDelivered ? 'Average speed' : 'Current Speed'}</p><strong>{speedCardValue}</strong></div>
          </div>
          {deliveryStatusBadge ? (
            <div className="tracking-info-card">
              <div className="tracking-info-card-icon"><Truck size={18} /></div>
              <div><p>Delivery Status</p>{deliveryStatusBadge}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {!isPickup && !isCourier && !isDelivered && deliveryState !== 'navigating' ? (
        <div className="tracking-gps-card">
          <DriverConnectionBadge status={connectionStatus} label={sharerLabel} lastUpdatedAt={lastLocationUpdatedAt} />
          <div>
            <span>Route source</span>
            <strong>{googleRoute ? `Google Maps${googleRoute.hasTrafficData ? ' (traffic-aware)' : ''}` : 'Route unavailable'}</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}
