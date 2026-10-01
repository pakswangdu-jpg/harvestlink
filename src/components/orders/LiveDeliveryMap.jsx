import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, Crosshair, Gauge, MapPin, Truck } from 'lucide-react';
import { DARK_MAP_STYLE, GOOGLE_MAPS_MAP_ID, loadGoogleMaps } from '../../lib/googleMapsLoader';
import { MAP_COLORS } from '../../lib/mapMarkerColors';
import { haversineKm } from '../../utils/geo';
import { distanceToPolylineKm, nearestIndexOnPath } from '../../services/routingService';
import { fetchGoogleRoute, fetchNavigationRoute } from '../../services/googleDirectionsService';
import { getLiveTransitProgress } from '../../services/orderService';
import { getUserById } from '../../services/authService';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';
import { useOrderConnectionStatus } from '../../hooks/useOrderConnectionStatus';
import { useTheme } from '../../contexts/ThemeContext';
import DriverConnectionBadge from './DriverConnectionBadge';























const ROUTE_COLOR = '#1a73e8';
const ROUTE_SLOW_COLOR = '#f59e0b';
const ROUTE_JAM_COLOR = '#ef4444';
const ROUTE_TRAVELED_COLOR = '#9aa0a6';
const ROUTE_DELIVERED_COLOR = '#16a34a';
const ROUTE_SHADOW_COLOR = '#4c1d95';
const ROUTE_ALT_COLOR = '#c7cbd1';
const SPEED_ROUTE_COLORS = { NORMAL: ROUTE_COLOR, SLOW: ROUTE_SLOW_COLOR, TRAFFIC_JAM: ROUTE_JAM_COLOR };

const MARKER_ANIMATION_DURATION_MS = 1200;
const ARRIVED_KM_THRESHOLD = 0.03;



const MIN_HEADING_MOVE_KM = 0.008;


const ROUTE_REFRESH_MIN_INTERVAL_MS = 20000;
const ROUTE_REFRESH_MIN_MOVE_KM = 0.05;
const ROUTE_DEVIATION_KM = 0.08;






const CAMERA_BEHIND_OFFSET_KM = 0.12;




function buildDotIcon(mapsApi, color) {
  const svg = `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="9" cy="9" r="6.5" fill="${color}" stroke="white" stroke-width="2.5"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(18, 18),
    anchor: new mapsApi.Point(9, 9),
  };
}







function buildVehicleMarkerContent() {
  const wrapper = document.createElement('div');
  wrapper.className = 'nav-vehicle-marker';
  wrapper.innerHTML = `
    <svg width="38" height="38" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 3 L33 33 L20 25.5 L7 33 Z" fill="${ROUTE_COLOR}" stroke="white" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
  `;
  return wrapper;
}

function updateVehicleHeading(content, headingDeg) {
  content.style.transform = `rotate(${headingDeg}deg)`;
}







function buildVehicleIcon(mapsApi, headingDeg) {
  const svg = `<svg width="38" height="38" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">` +
    `<g transform="rotate(${headingDeg} 20 20)">` +
    `<path d="M20 3 L33 33 L20 25.5 L7 33 Z" fill="${ROUTE_COLOR}" stroke="white" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` +
    `</g></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(38, 38),
    anchor: new mapsApi.Point(19, 19),
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
  if (entry.kind === 'advanced') updateVehicleHeading(entry.content, headingDeg);
  else entry.marker.setIcon(buildVehicleIcon(mapsApi, headingDeg));
}




function computeBearing(from, to) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const toDeg = (rad) => (rad * 180) / Math.PI;
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}



function offsetPoint(point, bearingDeg, km) {
  const earthRadiusKm = 6371;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (point.lat * Math.PI) / 180;
  const lng1 = (point.lng * Math.PI) / 180;
  const angularDistance = km / earthRadiusKm;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing));
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
}





function estimatedArrivalLabel(etaMinutes) {
  if (etaMinutes == null) return '—';
  return new Date(Date.now() + etaMinutes * 60000).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}




function zoomForSpeed(speedKmh) {
  if (speedKmh >= 60) return 15;
  if (speedKmh >= 35) return 16;
  return 17.5;
}

function animateMarkerTo(entry, targetPosition, durationMs = MARKER_ANIMATION_DURATION_MS) {
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

export default function LiveDeliveryMap({ order, destinationMunicipalityOverride, onRouteUpdate, deliveryStatusBadge }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapsApiRef = useRef(null);
  const layerRef = useRef([]);
  const carEntryRef = useRef(null);
  const routeMetaRef = useRef(null);
  const headingRef = useRef(0);
  const lastHeadingPositionRef = useRef(null);
  const autoEnabledRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [googleRoute, setGoogleRoute] = useState(null);
  const [autoFollow, setAutoFollow] = useState(false);

  const [farmerProfile, setFarmerProfile] = useState(null);
  const [buyerProfile, setBuyerProfile] = useState(null);

  const hasVectorMap = Boolean(GOOGLE_MAPS_MAP_ID);
  const { effectiveTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    getUserById(order.farmerId).then((profile) => { if (!cancelled) setFarmerProfile(profile); }).catch(() => {});
    getUserById(order.buyerId).then((profile) => { if (!cancelled) setBuyerProfile(profile); }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [order.farmerId, order.buyerId]);

  const destinationMunicipality = destinationMunicipalityOverride || order.deliveryMunicipality;






  const people = useMemo(() => [
    { id: order.farmerId, address: farmerProfile?.address, municipality: order.originMunicipality },
    { id: order.buyerId, address: buyerProfile?.address, municipality: destinationMunicipality },
  ], [order.farmerId, order.buyerId, farmerProfile?.address, buyerProfile?.address, order.originMunicipality, destinationMunicipality]);
  const coordsById = useMapCoordinates(people);
  const origin = coordsById[order.farmerId];
  const destination = coordsById[order.buyerId];
  const isPickup = order.deliveryMethod === 'buyer_pickup';
  const isCourier = order.deliveryMethod === 'courier';






  const travelOrigin = isPickup ? destination : origin;
  const travelDestination = isPickup ? origin : destination;




  const sharerLabel = isPickup ? 'Buyer' : 'Driver';
  const connectionStatus = useOrderConnectionStatus(order.id, { active: !isCourier, lastUpdateAt: order.locationUpdatedAt });

  const transit = getLiveTransitProgress(order);


  const currentPosition = transit.currentPosition;
  const isDelivered = order.status === 'completed';




  const deliveryState = isDelivered ? 'delivered' : (transit.isInTransit ? 'navigating' : 'preview');
  const remainingKm = currentPosition ? haversineKm(currentPosition, travelDestination) : null;




  const currentSpeedKmh = currentPosition
    ? Math.max(0, (Number.isFinite(currentPosition.speed) ? currentPosition.speed : 0) * 3.6)
    : null;





  const etaMinutes = googleRoute?.durationMinutes != null ? Math.max(0, Math.round(googleRoute.durationMinutes)) : null;
  const arrivalLabel = estimatedArrivalLabel(isDelivered ? null : etaMinutes);



  const tripDistanceKm = googleRoute?.distanceKm ?? haversineKm(origin, destination);
  const tripElapsedMinutes = order.transitStartedAt && order.updatedAt
    ? (new Date(order.updatedAt).getTime() - new Date(order.transitStartedAt).getTime()) / 60000
    : null;


  const completedAverageSpeedKmh = tripElapsedMinutes != null && tripElapsedMinutes >= 0.5
    ? tripDistanceKm / (tripElapsedMinutes / 60)
    : null;



  const isArrived = !isDelivered && remainingKm != null && remainingKm <= ARRIVED_KM_THRESHOLD;

  const etaCardValue = isDelivered ? 'Delivered' : isArrived ? 'Arrived' : (etaMinutes != null ? `${etaMinutes} min${etaMinutes === 1 ? '' : 's'}` : '—');





  const distanceCardValue = isDelivered
    ? '0.0 km'
    : remainingKm != null
      ? `${remainingKm.toFixed(1)} km`
      : googleRoute?.distanceKm != null ? `${googleRoute.distanceKm.toFixed(1)} km` : '—';
  const speedCardValue = isDelivered
    ? (completedAverageSpeedKmh != null ? `${completedAverageSpeedKmh.toFixed(0)} km/h avg` : '—')
    : (currentSpeedKmh != null ? `${currentSpeedKmh.toFixed(0)} km/h` : '—');





  useEffect(() => {
    if (!isDelivered) onRouteUpdate?.({ etaMinutes, remainingKm, currentSpeedKmh, isInTransit: Boolean(currentPosition) });




    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etaMinutes, remainingKm, currentSpeedKmh, currentPosition?.lat, currentPosition?.lng, isDelivered]);





  useEffect(() => {
    if (deliveryState === 'navigating' && !autoEnabledRef.current) {
      setAutoFollow(true);
      autoEnabledRef.current = true;
    }
  }, [deliveryState]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    let cancelled = false;
    loadGoogleMaps().then((mapsApi) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = new mapsApi.Map(containerRef.current, {
        center: origin,
        zoom: 12,
        mapId: GOOGLE_MAPS_MAP_ID || undefined,
        disableDefaultUI: true,
        zoomControl: true,


        zoomControlOptions: { position: mapsApi.ControlPosition.RIGHT_TOP },
        gestureHandling: 'greedy',



        styles: hasVectorMap ? undefined : (effectiveTheme === 'dark' ? DARK_MAP_STYLE : []),
      });
      mapRef.current = map;
      mapsApiRef.current = mapsApi;
      setMapReady(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  useEffect(() => {
    if (!mapReady || !mapRef.current || hasVectorMap) return;
    mapRef.current.setOptions({ styles: effectiveTheme === 'dark' ? DARK_MAP_STYLE : [] });
  }, [effectiveTheme, mapReady, hasVectorMap]);













  useEffect(() => {
    let cancelled = false;
    const fromPoint = currentPosition || travelOrigin;
    const meta = routeMetaRef.current;
    const now = Date.now();

    const destinationMoved = meta && (meta.destination.lat !== travelDestination.lat || meta.destination.lng !== travelDestination.lng);
    const shouldFetch = !meta || destinationMoved || (currentPosition && (
      distanceToPolylineKm(currentPosition, meta.points) > ROUTE_DEVIATION_KM
        ? now - meta.fetchedAt > 8000
        : now - meta.fetchedAt > ROUTE_REFRESH_MIN_INTERVAL_MS && haversineKm(meta.fetchedFrom, currentPosition) > ROUTE_REFRESH_MIN_MOVE_KM
    ));
    if (!shouldFetch) return undefined;

    (async () => {
      const navigationResult = await fetchNavigationRoute(fromPoint, travelDestination);
      const result = navigationResult || await fetchGoogleRoute(fromPoint, travelDestination).then(
        (legacy) => legacy && { ...legacy, speedIntervals: [], alternativeRoutes: [] },
      );
      if (cancelled || !result) return;
      routeMetaRef.current = { fetchedAt: Date.now(), fetchedFrom: fromPoint, points: result.points, destination: travelDestination };
      setGoogleRoute(result);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPosition?.lat, currentPosition?.lng, origin.lat, origin.lng, destination.lat, destination.lng]);




  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    layerRef.current.forEach((layer) => layer.setMap(null));
    layerRef.current = [];

    const originMarker = new mapsApi.Marker({ position: origin, map, icon: buildDotIcon(mapsApi, MAP_COLORS.origin), title: order.farmerName });
    const destinationMarker = new mapsApi.Marker({ position: destination, map, icon: buildDotIcon(mapsApi, MAP_COLORS.destination), title: order.buyerName });
    layerRef.current.push(originMarker, destinationMarker);

    const pathPoints = googleRoute?.points?.length > 1 ? googleRoute.points : [origin, destination];
    const fitToBothPins = () => {
      const bounds = new mapsApi.LatLngBounds();
      bounds.extend(origin);
      bounds.extend(destination);
      if (currentPosition) bounds.extend(currentPosition);
      map.fitBounds(bounds, 48);
    };

    if (deliveryState === 'preview') {











      if (isPickup || isCourier) {
        const shadow = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_SHADOW_COLOR, strokeWeight: 12, strokeOpacity: 0.16, geodesic: true, map, zIndex: 1 });
        const casing = new mapsApi.Polyline({ path: pathPoints, strokeColor: '#ffffff', strokeWeight: 8, strokeOpacity: 0.9, geodesic: true, map, zIndex: 2 });
        const routeLine = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_COLOR, strokeWeight: 5, strokeOpacity: 0.95, geodesic: true, map, zIndex: 3 });
        layerRef.current.push(shadow, casing, routeLine);
      }
      setVehicleMarkerMap(carEntryRef.current, null);
      map.setTilt(0);
      map.setHeading(0);
      fitToBothPins();
    } else if (deliveryState === 'delivered') {
      const shadow = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_SHADOW_COLOR, strokeWeight: 12, strokeOpacity: 0.16, geodesic: true, map, zIndex: 1 });
      const casing = new mapsApi.Polyline({ path: pathPoints, strokeColor: '#ffffff', strokeWeight: 8, strokeOpacity: 0.9, geodesic: true, map, zIndex: 2 });
      const routeLine = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_DELIVERED_COLOR, strokeWeight: 5, strokeOpacity: 0.95, geodesic: true, map, zIndex: 3 });
      layerRef.current.push(shadow, casing, routeLine);
      setVehicleMarkerMap(carEntryRef.current, null);
      map.setTilt(0);
      map.setHeading(0);
      fitToBothPins();
    } else {



      const shadow = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_SHADOW_COLOR, strokeWeight: 13, strokeOpacity: 0.18, geodesic: true, map, zIndex: 1 });
      layerRef.current.push(shadow);

      (googleRoute?.alternativeRoutes || []).forEach((altPoints) => {
        const alt = new mapsApi.Polyline({ path: altPoints, strokeColor: ROUTE_ALT_COLOR, strokeWeight: 4, strokeOpacity: 0.85, geodesic: true, map, zIndex: 2 });
        layerRef.current.push(alt);
      });

      const casing = new mapsApi.Polyline({ path: pathPoints, strokeColor: '#ffffff', strokeWeight: 10, strokeOpacity: 0.95, geodesic: true, map, zIndex: 3 });
      layerRef.current.push(casing);



      const intervals = googleRoute?.speedIntervals?.length
        ? googleRoute.speedIntervals
        : [{ startIndex: 0, endIndex: pathPoints.length - 1, speed: 'NORMAL' }];
      intervals.forEach(({ startIndex, endIndex, speed }) => {
        const segment = pathPoints.slice(Math.max(0, startIndex), Math.min(pathPoints.length, endIndex + 1));
        if (segment.length < 2) return;
        const segmentLine = new mapsApi.Polyline({ path: segment, strokeColor: SPEED_ROUTE_COLORS[speed] || ROUTE_COLOR, strokeWeight: 7, strokeOpacity: 1, geodesic: true, map, zIndex: 4 });
        layerRef.current.push(segmentLine);
      });




      let travelIndex = 0;
      if (currentPosition) {
        travelIndex = nearestIndexOnPath(currentPosition, pathPoints);
        if (travelIndex > 0) {
          const traveled = [...pathPoints.slice(0, travelIndex + 1), currentPosition];
          const traveledLine = new mapsApi.Polyline({ path: traveled, strokeColor: ROUTE_TRAVELED_COLOR, strokeWeight: 7, strokeOpacity: 0.9, geodesic: true, map, zIndex: 5 });
          layerRef.current.push(traveledLine);
        }
      }


      const startCap = new mapsApi.Circle({ center: pathPoints[0], radius: 5, strokeWeight: 0, fillColor: ROUTE_TRAVELED_COLOR, fillOpacity: 0.9, map, zIndex: 5, clickable: false });
      const lastInterval = intervals[intervals.length - 1];
      const endCapColor = travelIndex >= pathPoints.length - 1 ? ROUTE_TRAVELED_COLOR : (SPEED_ROUTE_COLORS[lastInterval?.speed] || ROUTE_COLOR);
      const endCap = new mapsApi.Circle({ center: pathPoints[pathPoints.length - 1], radius: 5, strokeWeight: 0, fillColor: endCapColor, fillOpacity: 1, map, zIndex: 4, clickable: false });
      layerRef.current.push(startCap, endCap);

      if (currentPosition) {




        if (Number.isFinite(currentPosition.heading)) {
          headingRef.current = currentPosition.heading;
          lastHeadingPositionRef.current = currentPosition;
        } else {
          const lastHeadingPosition = lastHeadingPositionRef.current;
          if (!lastHeadingPosition || haversineKm(lastHeadingPosition, currentPosition) > MIN_HEADING_MOVE_KM) {
            if (lastHeadingPosition) headingRef.current = computeBearing(lastHeadingPosition, currentPosition);
            lastHeadingPositionRef.current = currentPosition;
          }
        }

        if (!carEntryRef.current) {




          if (hasVectorMap) {
            const content = buildVehicleMarkerContent();
            updateVehicleHeading(content, headingRef.current);
            const marker = new mapsApi.AdvancedMarkerElement({ position: currentPosition, map, content, zIndex: 1000 });
            carEntryRef.current = { kind: 'advanced', marker, content, currentLatLng: currentPosition, animationFrameId: null };
          } else {
            const marker = new mapsApi.Marker({ position: currentPosition, map, icon: buildVehicleIcon(mapsApi, headingRef.current), zIndex: 1000 });
            carEntryRef.current = { kind: 'classic', marker, currentLatLng: currentPosition, animationFrameId: null };
          }
        } else {
          setVehicleMarkerMap(carEntryRef.current, map);
          setVehicleMarkerHeading(carEntryRef.current, mapsApi, headingRef.current);
          animateMarkerTo(carEntryRef.current, currentPosition);
        }





        if (autoFollow) {
          const zoom = zoomForSpeed(currentSpeedKmh || 0);
          const center = hasVectorMap ? offsetPoint(currentPosition, (headingRef.current + 180) % 360, CAMERA_BEHIND_OFFSET_KM) : currentPosition;
          map.moveCamera({ center, zoom, heading: hasVectorMap ? headingRef.current : 0, tilt: hasVectorMap ? 45 : 0 });
        }
      } else {
        setVehicleMarkerMap(carEntryRef.current, null);
      }

      if (!autoFollow || !currentPosition) fitToBothPins();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, googleRoute, currentPosition?.lat, currentPosition?.lng, origin.lat, origin.lng, destination.lat, destination.lng, autoFollow, deliveryState]);

  useEffect(() => {
    return () => {
      if (carEntryRef.current?.animationFrameId != null) cancelAnimationFrame(carEntryRef.current.animationFrameId);
    };
  }, []);

  return (
    <div className="live-delivery-map-wrap">
      <div className="nav-map-container">
        <div ref={containerRef} className="live-delivery-map" />

        {deliveryState === 'navigating' ? (
          <button
            type="button"
            className={`nav-recenter-btn ${autoFollow ? 'active' : ''}`}
            onClick={() => setAutoFollow((value) => !value)}
            aria-label={autoFollow ? 'Following driver' : 'Re-center on driver'}
            title={autoFollow ? 'Following driver' : 'Re-center on driver'}
          >
            <Crosshair size={18} />
          </button>
        ) : null}

        {deliveryState === 'navigating' && (connectionStatus === 'offline' || connectionStatus === 'reconnecting') ? (
          <div className="nav-map-overlay-banner">Waiting for driver connection…</div>
        ) : null}
      </div>

      {deliveryState === 'navigating' ? (
        <div className="nav-info-card">
          <div className="nav-info-card-header">
            <span className={`nav-status-dot status-${connectionStatus || 'reconnecting'}`} />
            <strong>{isPickup ? order.buyerName : order.farmerName}</strong>
            <span className="nav-info-card-vehicle">{isPickup ? 'On the way to pickup' : 'Delivery vehicle'}</span>
          </div>
          <div className="nav-info-card-grid">
            <div><p>ETA</p><strong className={connectionStatus === 'online' || connectionStatus == null ? '' : 'is-paused'}>{etaCardValue}</strong></div>
            <div><p>Distance</p><strong>{distanceCardValue}</strong></div>
            <div><p>Arrival</p><strong>{arrivalLabel}</strong></div>
            <div><p>Speed</p><strong>{speedCardValue}</strong></div>
          </div>
          {deliveryStatusBadge ? <div className="nav-info-card-status">{deliveryStatusBadge}</div> : null}
          <div className="nav-info-card-gps">
            <DriverConnectionBadge status={connectionStatus} label={sharerLabel} lastUpdatedAt={order.locationUpdatedAt} />
          </div>
        </div>
      ) : null}

      {deliveryState !== 'navigating' ? (
        <div className="tracking-info-cards">
          <div className="tracking-info-card">
            <div className="tracking-info-card-icon"><Clock3 size={18} /></div>
            <div><p>ETA</p><strong>{etaCardValue}</strong></div>
          </div>
          <div className="tracking-info-card">
            <div className="tracking-info-card-icon"><MapPin size={18} /></div>
            <div><p>Remaining Distance</p><strong>{distanceCardValue}</strong></div>
          </div>
          <div className="tracking-info-card">
            <div className="tracking-info-card-icon"><Gauge size={18} /></div>
            <div><p>Current Speed</p><strong>{speedCardValue}</strong></div>
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
          <DriverConnectionBadge status={connectionStatus} label={sharerLabel} lastUpdatedAt={order.locationUpdatedAt} />
          <div>
            <span>Route source</span>
            <strong>Google Maps{googleRoute?.hasTrafficData ? ' (live traffic)' : ''}</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}
