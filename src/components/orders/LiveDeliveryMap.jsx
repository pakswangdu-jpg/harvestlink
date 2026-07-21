import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, Crosshair, Gauge, MapPin, Truck, Wifi, WifiOff } from 'lucide-react';
import { loadGoogleMaps } from '../../lib/googleMapsLoader';
import { haversineKm } from '../../utils/geo';
import { distanceToPolylineKm } from '../../services/routingService';
import { fetchGoogleRoute } from '../../services/googleDirectionsService';
import { getLiveTransitProgress } from '../../services/orderService';
import { getUserById } from '../../services/authService';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';
import { formatRelativeTime } from '../../utils/formatters';
import Button from '../common/Button';

// Replaces the old OSRM-cached, draw-once route (DeliveryMap.jsx) for this single-order live
// tracking view. Position comes from `order.currentLat/currentLng` — kept fresh by
// OrderTracking.jsx's Supabase Realtime `postgres_changes` subscription, never a socket or a
// simulated/interpolated position — so this component only ever renders a real GPS fix or no
// car marker at all. The route itself is a real Google Directions driving route
// (traffic-aware), re-fetched as the farmer actually moves, never drawn once and left static.
const ROUTE_LINE_COLOR = '#1a73e8';
const CAR_FILL_COLOR = '#16a34a';
const MARKER_ANIMATION_DURATION_MS = 1200;
const ARRIVED_KM_THRESHOLD = 0.03;
// Ignore GPS jitter below this when deciding whether to rotate the car icon — a stationary
// farmer's raw fix drifts a few meters between reads, which would otherwise spin the icon
// back and forth for no real movement.
const MIN_HEADING_MOVE_KM = 0.008;
// Directions is a billed API — refetch on a real move/deviation, not on every single Realtime
// tick (same throttling discipline as the old OSRM caller it replaces).
const ROUTE_REFRESH_MIN_INTERVAL_MS = 20000;
const ROUTE_REFRESH_MIN_MOVE_KM = 0.05;
const ROUTE_DEVIATION_KM = 0.08;

// Small solid dot instead of a full teardrop pin — keeps the two fixed endpoints from
// visually competing with the route line and the car, which are the parts that actually
// change/move.
function buildDotIcon(mapsApi, color) {
  const svg = `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="9" cy="9" r="6.5" fill="${color}" stroke="white" stroke-width="2.5"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(18, 18),
    anchor: new mapsApi.Point(9, 9),
  };
}

// A literal car glyph (not an emoji-in-a-badge) that sits directly on the route line and
// actually points in the direction of travel — `headingDeg` is a standard compass bearing
// (0 = north, clockwise), computed from consecutive real GPS fixes, and baked into the SVG
// itself as a rotation transform since Google Maps image-based marker icons (unlike vector
// Symbol icons) have no separate rotation property.
function buildCarIcon(mapsApi, headingDeg = 0) {
  const svg = `<svg width="30" height="30" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">` +
    `<g transform="rotate(${headingDeg} 12 12)">` +
    `<rect x="6" y="2.5" width="12" height="19" rx="4" fill="${CAR_FILL_COLOR}" stroke="white" stroke-width="1.5"/>` +
    `<rect x="8" y="5.5" width="8" height="5" rx="1.5" fill="white" opacity="0.9"/>` +
    `</g></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(30, 30),
    anchor: new mapsApi.Point(15, 15),
  };
}

// Standard forward-azimuth compass bearing (0-360, 0 = north, clockwise) from one lat/lng to
// another — used purely to orient the car icon, not for any distance/ETA math.
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

function animateMarkerTo(entry, targetPosition, durationMs = MARKER_ANIMATION_DURATION_MS) {
  if (entry.animationFrameId != null) cancelAnimationFrame(entry.animationFrameId);
  const startPosition = entry.marker.getPosition();
  const start = startPosition ? { lat: startPosition.lat(), lng: startPosition.lng() } : targetPosition;
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

export default function LiveDeliveryMap({ order, destinationMunicipalityOverride, onRouteUpdate, deliveryStatusBadge }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapsApiRef = useRef(null);
  const layerRef = useRef([]);
  const carEntryRef = useRef(null);
  const routeMetaRef = useRef(null);
  const trafficLayerRef = useRef(null);
  const headingRef = useRef(0);
  const lastHeadingPositionRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [googleRoute, setGoogleRoute] = useState(null);
  const [autoFollow, setAutoFollow] = useState(false);

  const [farmerProfile, setFarmerProfile] = useState(null);
  const [buyerProfile, setBuyerProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getUserById(order.farmerId).then((profile) => { if (!cancelled) setFarmerProfile(profile); }).catch(() => {});
    getUserById(order.buyerId).then((profile) => { if (!cancelled) setBuyerProfile(profile); }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [order.farmerId, order.buyerId]);

  const destinationMunicipality = destinationMunicipalityOverride || order.deliveryMunicipality;
  // Geocodes each party's actual registered street address (when on file) to a precise pin —
  // the same infrastructure the dashboard reference-pin maps already use (useMapCoordinates,
  // geocodeService.js) — instead of a blunt municipality-center approximation, which is what
  // made the farmer's pin land nowhere near their real address. Falls back to a jittered
  // municipality center automatically while geocoding is in flight or if no address is on
  // file, so this never blocks the initial render or shows nothing.
  const people = useMemo(() => [
    { id: order.farmerId, address: farmerProfile?.address, municipality: order.originMunicipality },
    { id: order.buyerId, address: buyerProfile?.address, municipality: destinationMunicipality },
  ], [order.farmerId, order.buyerId, farmerProfile?.address, buyerProfile?.address, order.originMunicipality, destinationMunicipality]);
  const coordsById = useMapCoordinates(people);
  const origin = coordsById[order.farmerId];
  const destination = coordsById[order.buyerId];
  const isPickup = order.deliveryMethod === 'buyer_pickup';

  const transit = getLiveTransitProgress(order);

  // Real GPS fix only — never falls back to an interpolated "estimated" position.
  const currentPosition = transit.currentPosition;
  const isDelivered = order.status === 'completed';
  const remainingKm = currentPosition ? haversineKm(currentPosition, destination) : null;
  // The device's own instantaneous reading (position.coords.speed, m/s -> km/h) — not a route
  // average. Whenever there's a live fix at all, this always resolves to a real number (0
  // when stationary or when the device didn't report a speed), never a dash and never a
  // fabricated value derived from position deltas.
  const currentSpeedKmh = currentPosition
    ? Math.max(0, (Number.isFinite(currentPosition.speed) ? currentPosition.speed : 0) * 3.6)
    : null;
  // Google's own traffic-aware duration for the exact route just fetched (currentPosition ->
  // destination once in transit, origin -> destination beforehand — see the route-fetch
  // effect below) — using it directly here is both simpler and more accurate than manually
  // re-deriving a time from remainingKm/averageSpeedKmh, and it's what lets this same number
  // serve as both the upfront estimate and the live remaining ETA.
  const etaMinutes = googleRoute?.durationMinutes != null ? Math.max(0, Math.round(googleRoute.durationMinutes)) : null;

  // A trip summary once delivered, computed from timestamps already on the order — showing
  // blank dashes on a finished delivery would look broken rather than complete.
  const tripDistanceKm = googleRoute?.distanceKm ?? haversineKm(origin, destination);
  const tripElapsedMinutes = order.transitStartedAt && order.updatedAt
    ? (new Date(order.updatedAt).getTime() - new Date(order.transitStartedAt).getTime()) / 60000
    : null;
  // Below ~30s, elapsed time is too noisy to divide by — dividing a real trip distance by a
  // near-zero duration produces a nonsense speed rather than a merely imprecise one.
  const completedAverageSpeedKmh = tripElapsedMinutes != null && tripElapsedMinutes >= 0.5
    ? tripDistanceKm / (tripElapsedMinutes / 60)
    : null;

  // A tighter "physically at the door" signal than the broader ~400m "Near Destination"
  // status elsewhere on the page — distinct concepts, so this doesn't touch that threshold.
  const isArrived = !isDelivered && remainingKm != null && remainingKm <= ARRIVED_KM_THRESHOLD;

  const etaCardValue = isDelivered ? 'Delivered' : isArrived ? 'Arrived' : (etaMinutes != null ? `${etaMinutes} min${etaMinutes === 1 ? '' : 's'}` : '—');
  const distanceCardValue = isDelivered ? '0.0 km' : (remainingKm != null ? `${remainingKm.toFixed(1)} km` : '—');
  const speedCardValue = isDelivered
    ? (completedAverageSpeedKmh != null ? `${completedAverageSpeedKmh.toFixed(0)} km/h avg` : '—')
    : (currentSpeedKmh != null ? `${currentSpeedKmh.toFixed(0)} km/h` : '—');

  // Reports this component's real, traffic-aware Google numbers up to OrderTracking.jsx so
  // its own "Estimated delivery" line and "Live overview" cards show the SAME figures as this
  // map, instead of their older, separate OSRM-based estimate — the page showing two
  // different ETAs for the same trip is exactly the "why is this wrong" confusion this fixes.
  useEffect(() => {
    if (!isDelivered) onRouteUpdate?.({ etaMinutes, remainingKm, currentSpeedKmh, isInTransit: Boolean(currentPosition) });
    // currentPosition is a plain { lat, lng } object rebuilt fresh on every render (from
    // getLiveTransitProgress, uncached) — depending on the object itself instead of its
    // primitive fields would re-fire this effect (and re-render the parent) every render,
    // forever, since a new object never equals the last one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etaMinutes, remainingKm, currentSpeedKmh, currentPosition?.lat, currentPosition?.lng, isDelivered]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    let cancelled = false;
    loadGoogleMaps().then((mapsApi) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = new mapsApi.Map(containerRef.current, {
        center: origin,
        zoom: 12,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
      });
      trafficLayerRef.current = new mapsApi.TrafficLayer();
      trafficLayerRef.current.setMap(map);
      mapRef.current = map;
      mapsApiRef.current = mapsApi;
      setMapReady(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetches the real Google driving route: from the live GPS position once one exists,
  // otherwise from the farm itself, so a real route is on screen from the moment the order is
  // confirmed — never a straight line, and never redrawn on every single position tick.
  // Also always refetches when origin/destination themselves change (not just moved) — that
  // happens once, shortly after mount, when geocoding upgrades a fallback municipality-center
  // pin to the party's real registered address.
  useEffect(() => {
    if (isPickup) return undefined;
    let cancelled = false;
    const fromPoint = currentPosition || origin;
    const meta = routeMetaRef.current;
    const now = Date.now();

    const destinationMoved = meta && (meta.destination.lat !== destination.lat || meta.destination.lng !== destination.lng);
    const shouldFetch = !meta || destinationMoved || (currentPosition && (
      distanceToPolylineKm(currentPosition, meta.points) > ROUTE_DEVIATION_KM
        ? now - meta.fetchedAt > 8000
        : now - meta.fetchedAt > ROUTE_REFRESH_MIN_INTERVAL_MS && haversineKm(meta.fetchedFrom, currentPosition) > ROUTE_REFRESH_MIN_MOVE_KM
    ));
    if (!shouldFetch) return undefined;

    fetchGoogleRoute(fromPoint, destination).then((result) => {
      if (cancelled || !result) return;
      routeMetaRef.current = { fetchedAt: Date.now(), fetchedFrom: fromPoint, points: result.points, destination };
      setGoogleRoute(result);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPosition?.lat, currentPosition?.lng, isPickup, origin.lat, origin.lng, destination.lat, destination.lng]);

  // Renders/updates markers + the green route polyline whenever the position or route data
  // changes — the car marker is persisted (not recreated) so it can animate smoothly.
  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    layerRef.current.forEach((layer) => layer.setMap(null));
    layerRef.current = [];

    const originMarker = new mapsApi.Marker({ position: origin, map, icon: buildDotIcon(mapsApi, '#15803d'), title: order.farmerName });
    const destinationMarker = new mapsApi.Marker({ position: destination, map, icon: buildDotIcon(mapsApi, '#1d4ed8'), title: order.buyerName });
    layerRef.current.push(originMarker, destinationMarker);

    const pathPoints = googleRoute?.points?.length > 1 ? googleRoute.points : [origin, destination];
    const casing = new mapsApi.Polyline({ path: pathPoints, strokeColor: '#ffffff', strokeWeight: 8, strokeOpacity: 0.9, map });
    const routeLine = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_LINE_COLOR, strokeWeight: 5, strokeOpacity: 0.95, map });
    layerRef.current.push(casing, routeLine);

    if (currentPosition && !isPickup) {
      // The device's own compass heading (when it reports one) is more accurate than a
      // bearing derived from two consecutive GPS fixes a few meters apart — only fall back to
      // computing it ourselves when the device didn't supply one (common at low speed/on
      // devices without a magnetometer fix).
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
        const marker = new mapsApi.Marker({ position: currentPosition, map, icon: buildCarIcon(mapsApi, headingRef.current) });
        carEntryRef.current = { marker, animationFrameId: null };
      } else {
        carEntryRef.current.marker.setMap(map);
        carEntryRef.current.marker.setIcon(buildCarIcon(mapsApi, headingRef.current));
        animateMarkerTo(carEntryRef.current, currentPosition);
      }
    } else if (carEntryRef.current) {
      carEntryRef.current.marker.setMap(null);
    }

    // Auto-follow keeps the car centered (a tight, driver-cam-style zoom) instead of framing
    // both endpoints — only meaningful once there's an actual position to follow.
    if (autoFollow && currentPosition) {
      map.panTo(currentPosition);
    } else {
      const bounds = new mapsApi.LatLngBounds();
      bounds.extend(origin);
      bounds.extend(destination);
      if (currentPosition) bounds.extend(currentPosition);
      map.fitBounds(bounds, 48);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, googleRoute, currentPosition?.lat, currentPosition?.lng, origin.lat, origin.lng, destination.lat, destination.lng, autoFollow]);

  useEffect(() => {
    return () => {
      if (carEntryRef.current?.animationFrameId != null) cancelAnimationFrame(carEntryRef.current.animationFrameId);
    };
  }, []);

  // Zooms in once auto-follow actually has a real position to center on (a fitBounds-
  // appropriate zoom is usually too far out for a driver-cam view) — subsequent position
  // updates only pan, never re-zoom, so a manual zoom out/in while following isn't fought on
  // every GPS tick. Gated on currentPosition, not just the toggle: switching this on before
  // the farmer has any live GPS fix (still "Estimated", not "Live GPS") left the render
  // effect's own fitBounds centered on the midpoint between the two pins — often nowhere
  // useful, sometimes literally over open water between two coastal municipalities — and this
  // used to force a tight zoom onto that empty point instead of leaving the normal
  // both-pins view alone until there's an actual car to follow.
  useEffect(() => {
    if (autoFollow && currentPosition && mapRef.current) mapRef.current.setZoom(17);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFollow, currentPosition?.lat, currentPosition?.lng]);

  return (
    <div className="live-delivery-map-wrap">
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

      {!isPickup && transit.isInTransit ? (
        <div className="live-delivery-map-actions">
          <Button size="sm" variant={autoFollow ? 'primary' : 'secondary'} onClick={() => setAutoFollow((value) => !value)}>
            <Crosshair size={15} /> {autoFollow ? 'Following driver' : 'Auto-follow'}
          </Button>
        </div>
      ) : null}

      <div ref={containerRef} className="live-delivery-map" />

      {!isPickup && !isDelivered ? (
        <div className="tracking-gps-card">
          <div>
            <span>Last GPS update</span>
            <strong>{order.locationUpdatedAt ? formatRelativeTime(order.locationUpdatedAt) : 'Not shared yet'}</strong>
          </div>
          <div>
            <span>Signal</span>
            <strong className="tracking-connection-status">
              {currentPosition ? <><Wifi size={14} /> Live GPS</> : <><WifiOff size={14} /> Waiting for signal…</>}
            </strong>
          </div>
          <div>
            <span>Route source</span>
            <strong>Google Maps{googleRoute?.hasTrafficData ? ' (live traffic)' : ''}</strong>
          </div>
        </div>
      ) : null}
    </div>
  );
}
