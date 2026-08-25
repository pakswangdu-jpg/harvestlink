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

// A Google-Maps-navigation-style live tracking view — position comes from
// `order.currentLat/currentLng` — kept fresh by OrderTracking.jsx's Supabase Realtime
// `postgres_changes` subscription, never a socket or a simulated/interpolated position — so
// this component only ever renders a real GPS fix or no vehicle marker at all. The route
// itself is a real Google route (traffic-aware, via the Routes API — see
// googleDirectionsService.js's fetchNavigationRoute), re-fetched as whichever party is
// actually moving actually moves, never drawn once and left static.
//
// Works identically for a real delivery (the FARMER shares live location, moving from the
// farm toward the buyer — see useFarmerActiveDeliverySharing.js) and a buyer_pickup order
// (the BUYER shares live location instead, moving from their own address toward the farm —
// see useBuyerActivePickupSharing.js) — see travelOrigin/travelDestination below for how the
// direction is swapped between the two.
//
// Three visual states, driven by the order's own real status (never a separate flag):
//   'preview'    — order confirmed but not yet at its "in transit" step (out_for_delivery
//                  for a delivery, ready_for_pickup for a pickup order): markers only, plus
//                  an early route preview for pickup (see the render effect below).
//   'navigating' — out for delivery, or a pickup order that's ready and being shared live:
//                  the full nav treatment below.
//   'delivered'  — order completed (delivered, or picked up): a solid green "Delivered
//                  Successfully" route.
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
// Ignore GPS jitter below this when deciding whether to rotate the vehicle icon — a
// stationary farmer's raw fix drifts a few meters between reads, which would otherwise spin
// the icon back and forth for no real movement.
const MIN_HEADING_MOVE_KM = 0.008;
// Directions/Routes are billed APIs — refetch on a real move/deviation, not on every single
// Realtime tick (same throttling discipline as the old OSRM caller it replaces).
const ROUTE_REFRESH_MIN_INTERVAL_MS = 20000;
const ROUTE_REFRESH_MIN_MOVE_KM = 0.05;
const ROUTE_DEVIATION_KM = 0.08;
// How far behind the vehicle (opposite its heading) the camera centers while following —
// pushes the vehicle toward the bottom of the frame instead of dead-center, like a real
// nav app, leaving more of the upcoming road visible. Only meaningful once the map is
// actually rotated to match the heading (see hasVectorMap below) — offsetting the center
// without also rotating the map would push the vehicle toward an arbitrary screen edge
// instead of consistently "down".
const CAMERA_BEHIND_OFFSET_KM = 0.12;

// Small solid dot instead of a full teardrop pin — keeps the two fixed endpoints from
// visually competing with the route line and the vehicle, which are the parts that
// actually change/move.
function buildDotIcon(mapsApi, color) {
  const svg = `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">` +
    `<circle cx="9" cy="9" r="6.5" fill="${color}" stroke="white" stroke-width="2.5"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(18, 18),
    anchor: new mapsApi.Point(9, 9),
  };
}

// The DOM content for the vehicle's AdvancedMarkerElement — a navigation chevron (not a
// literal car), blue with a white outline and a soft drop-shadow, matching a Google Maps
// nav-mode vehicle puck. Rotation is applied afterward via CSS transform (see
// updateVehicleHeading) rather than baked into the SVG, so it can transition smoothly
// between headings instead of snapping. Only usable on a vector map (a real Map ID — see
// hasVectorMap below); buildVehicleIcon is the fallback for everyone else.
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

// The classic-Marker equivalent of buildVehicleMarkerContent — same chevron shape, but as a
// data-URL icon with the rotation baked directly into the SVG, since a plain Marker's icon
// has no separate CSS transform to animate. Used whenever there's no Map ID configured:
// google.maps.marker.AdvancedMarkerElement refuses to render at all without a valid vector
// Map ID (throws, doesn't just warn), so this keeps the vehicle marker working — just
// without the smooth CSS-transition rotation — on every map, Map ID or not.
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

// The two vehicle-marker kinds ('advanced' — AdvancedMarkerElement, only when a Map ID is
// configured; 'classic' — a plain Marker otherwise) expose different APIs for the same three
// operations. These wrappers let the render effect and animateMarkerTo below stay agnostic
// to which kind is actually in play.
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

// Standard forward-azimuth compass bearing (0-360, 0 = north, clockwise) from one lat/lng to
// another — used to orient the vehicle icon and, once a vector map is available, to rotate
// the camera itself to match.
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

// A point `km` away from `point` along compass bearing `bearingDeg` — used to compute the
// "behind the vehicle" camera-follow center (see CAMERA_BEHIND_OFFSET_KM above).
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

// A clock-time label ("2:45 PM") for when the trip is expected to finish, given a live ETA
// in minutes from now — pulled out into its own named function (rather than inlined in the
// component body) purely so the Date.now() read happens inside a plain helper the same way
// formatRelativeTime/isRecentlyActive already do elsewhere, not directly during render.
function estimatedArrivalLabel(etaMinutes) {
  if (etaMinutes == null) return '—';
  return new Date(Date.now() + etaMinutes * 60000).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

// Tighter zoom at low speed (more useful detail while crawling/stopped), wider at highway
// speed (more upcoming road visible) — the same "zoom dynamically depending on speed"
// behavior a real nav app uses.
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
  const isCourier = order.deliveryMethod === 'courier';
  // `origin`/`destination` above are fixed to "farmer's pin" / "buyer's pin" — used for the
  // two static markers regardless of delivery method. `travelOrigin`/`travelDestination`
  // are about who's actually MOVING: for a real delivery the farmer moves from origin to
  // destination; for a pickup order it's the reverse — the buyer moves FROM their own
  // location TO the farm (see useBuyerActivePickupSharing.js) — so the route/ETA/"arrived"
  // math below needs the swapped pair, not the raw origin/destination.
  const travelOrigin = isPickup ? destination : origin;
  const travelDestination = isPickup ? origin : destination;

  // A courier (Lalamove) order never has a HarvestLink-tracked sharer at all (see the file
  // header comment) — no point tracking a connection status for one. 'Driver' for a real
  // delivery (the farmer is the one sharing/moving); 'Buyer' for a pickup order (the buyer is).
  const sharerLabel = isPickup ? 'Buyer' : 'Driver';
  const connectionStatus = useOrderConnectionStatus(order.id, { active: !isCourier, lastUpdateAt: order.locationUpdatedAt });

  const transit = getLiveTransitProgress(order);

  // Real GPS fix only — never falls back to an interpolated "estimated" position.
  const currentPosition = transit.currentPosition;
  const isDelivered = order.status === 'completed';
  // 'preview' (confirmed but nothing to navigate yet — not out for delivery, or a pickup
  // order not yet ready), 'navigating' (out for delivery, or a pickup order that's ready and
  // being shared live), or 'delivered'/'picked up' (completed) — see the file header comment
  // for what each renders.
  const deliveryState = isDelivered ? 'delivered' : (transit.isInTransit ? 'navigating' : 'preview');
  const remainingKm = currentPosition ? haversineKm(currentPosition, travelDestination) : null;
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
  const arrivalLabel = estimatedArrivalLabel(isDelivered ? null : etaMinutes);

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

  // Auto-follow turns itself on the moment the order actually enters navigation mode ("Enable
  // camera following" automatically after Out for Delivery) — but only ONCE; a buyer/farmer
  // who deliberately pans away and toggles it back off isn't fought on every subsequent
  // render.
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
        // Top-right, alongside the recenter button — the default bottom-right spot would sit
        // directly under the floating nav info card once navigation mode is active.
        zoomControlOptions: { position: mapsApi.ControlPosition.RIGHT_TOP },
        gestureHandling: 'greedy',
        // A `styles` array is ignored (and warned about) whenever a real vector `mapId` is
        // set — that map's look is controlled from the Cloud Console instead, so this is
        // only applied on the classic-rendering fallback used when no Map ID is configured.
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

  // Re-styles the already-created map in place when the theme changes (classic-rendering
  // fallback only — see the styles: comment above for why a vector/Map ID map is skipped).
  useEffect(() => {
    if (!mapReady || !mapRef.current || hasVectorMap) return;
    mapRef.current.setOptions({ styles: effectiveTheme === 'dark' ? DARK_MAP_STYLE : [] });
  }, [effectiveTheme, mapReady, hasVectorMap]);

  // Fetches the real driving route from travelOrigin to travelDestination — for a delivery
  // that's farm -> buyer; for a pickup order it's the reverse, buyer -> farm (see
  // travelOrigin/travelDestination above). Starts from the live GPS position once one
  // exists (whichever party is actually moving for this order), otherwise from
  // travelOrigin, so a real route is on screen from the moment the order is confirmed —
  // never a straight line, and never redrawn on every single position tick. Also always
  // refetches when travelOrigin/travelDestination themselves change (not just moved) —
  // that happens once, shortly after mount, when geocoding upgrades a fallback
  // municipality-center pin to the party's real registered address. Tries the Routes API
  // first (real per-segment traffic + alternates, see fetchNavigationRoute) and falls back
  // to the classic Directions route (solid color, no traffic segments) if that's
  // unavailable — never blocks on it.
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

  // Renders/updates markers + the route polylines whenever the position, route data, or
  // delivery state changes — the vehicle marker is persisted (not recreated) so it can
  // animate smoothly between GPS updates instead of jumping.
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
      // A confirmed order that hasn't reached its "in transit" step yet (out_for_delivery
      // for a delivery, ready_for_pickup for a pickup order) shows markers only — no route
      // line until there's actually a live trip to navigate. A pickup order still gets an
      // early preview of the road route to the farm while it's just "preparing", though,
      // since knowing the way there ahead of time is useful even before the buyer sets off
      // (this same route keeps rendering, now with the full nav treatment, once the order
      // reaches deliveryState === 'navigating' below). A courier (Lalamove) order NEVER
      // reaches 'navigating' — isInTransit is always false for one (see
      // getLiveTransitProgress) since there's no HarvestLink-tracked live position for a
      // third-party courier — so this route preview is the only route line it ever gets;
      // it stays a static farm-to-buyer road route, never a live/simulated position.
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
      // 'navigating' — the full nav-mode treatment: layered thick route (shadow -> alt
      // routes -> white casing -> traffic-colored segments -> gray traveled overlay ->
      // rounded end caps), a rotating vehicle marker, and camera follow.
      const shadow = new mapsApi.Polyline({ path: pathPoints, strokeColor: ROUTE_SHADOW_COLOR, strokeWeight: 13, strokeOpacity: 0.18, geodesic: true, map, zIndex: 1 });
      layerRef.current.push(shadow);

      (googleRoute?.alternativeRoutes || []).forEach((altPoints) => {
        const alt = new mapsApi.Polyline({ path: altPoints, strokeColor: ROUTE_ALT_COLOR, strokeWeight: 4, strokeOpacity: 0.85, geodesic: true, map, zIndex: 2 });
        layerRef.current.push(alt);
      });

      const casing = new mapsApi.Polyline({ path: pathPoints, strokeColor: '#ffffff', strokeWeight: 10, strokeOpacity: 0.95, geodesic: true, map, zIndex: 3 });
      layerRef.current.push(casing);

      // Real Google speed-reading data when the Routes API provided it; a single solid
      // "NORMAL"-colored segment otherwise — never a guessed orange/red.
      const intervals = googleRoute?.speedIntervals?.length
        ? googleRoute.speedIntervals
        : [{ startIndex: 0, endIndex: pathPoints.length - 1, speed: 'NORMAL' }];
      intervals.forEach(({ startIndex, endIndex, speed }) => {
        const segment = pathPoints.slice(Math.max(0, startIndex), Math.min(pathPoints.length, endIndex + 1));
        if (segment.length < 2) return;
        const segmentLine = new mapsApi.Polyline({ path: segment, strokeColor: SPEED_ROUTE_COLORS[speed] || ROUTE_COLOR, strokeWeight: 7, strokeOpacity: 1, geodesic: true, map, zIndex: 4 });
        layerRef.current.push(segmentLine);
      });

      // Traveled portion — a gray overlay from the route start up to the vehicle's current
      // position, drawn ON TOP of the traffic-colored segments so it visibly "consumes"
      // them as the vehicle progresses, instead of recoloring the underlying data.
      let travelIndex = 0;
      if (currentPosition) {
        travelIndex = nearestIndexOnPath(currentPosition, pathPoints);
        if (travelIndex > 0) {
          const traveled = [...pathPoints.slice(0, travelIndex + 1), currentPosition];
          const traveledLine = new mapsApi.Polyline({ path: traveled, strokeColor: ROUTE_TRAVELED_COLOR, strokeWeight: 7, strokeOpacity: 0.9, geodesic: true, map, zIndex: 5 });
          layerRef.current.push(traveledLine);
        }
      }

      // Rounded route edges — a filled circle at each end caps the flat polyline butt-ends.
      const startCap = new mapsApi.Circle({ center: pathPoints[0], radius: 5, strokeWeight: 0, fillColor: ROUTE_TRAVELED_COLOR, fillOpacity: 0.9, map, zIndex: 5, clickable: false });
      const lastInterval = intervals[intervals.length - 1];
      const endCapColor = travelIndex >= pathPoints.length - 1 ? ROUTE_TRAVELED_COLOR : (SPEED_ROUTE_COLORS[lastInterval?.speed] || ROUTE_COLOR);
      const endCap = new mapsApi.Circle({ center: pathPoints[pathPoints.length - 1], radius: 5, strokeWeight: 0, fillColor: endCapColor, fillOpacity: 1, map, zIndex: 4, clickable: false });
      layerRef.current.push(startCap, endCap);

      if (currentPosition) {
        // The device's own compass heading (when it reports one) is more accurate than a
        // bearing derived from two consecutive GPS fixes a few meters apart — only fall
        // back to computing it ourselves when the device didn't supply one (common at low
        // speed/on devices without a magnetometer fix).
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
          // AdvancedMarkerElement requires a real vector Map ID to construct at all (it
          // throws otherwise, which is what broke this map before this fix) — only used
          // when one is actually configured; a classic Marker with a rotated-icon fallback
          // works everywhere else.
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

        // Camera follow — moveCamera animates the transition itself (position/zoom, plus
        // heading/tilt on a vector map) rather than jumping, so this alone satisfies "follow
        // the driver" + "rotate to match heading" + "tilt ~45°" + "smoothly animate camera
        // movements" + "zoom dynamically depending on speed" all in one call.
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
