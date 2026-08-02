import { loadGoogleGeometry, loadGoogleRoutes } from '../lib/googleMapsLoader';

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const ROUTES_API_FIELD_MASK = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.polyline.encodedPolyline',
  'routes.travelAdvisory.speedReadingIntervals',
].join(',');
const SPEED_VALUES = new Set(['NORMAL', 'SLOW', 'TRAFFIC_JAM']);

function toWaypoint({ lat, lng }) {
  return { location: { latLng: { latitude: lat, longitude: lng } } };
}

// Google Directions-based routing for the Grab-like live tracking modal
// (LiveTrackingModal.jsx) only — kept fully separate from routingService.js (OSRM), which
// DeliveryMap.jsx/OrderTracking.jsx already use and which this must not disturb or share
// any code path with.
//
// Directions API is billed per request — same discipline the existing OSRM caller in
// DeliveryMap.jsx already applies: this is meant to be called on a throttle (every 15-20s,
// or on a real route deviation), never on every single 3-5s GPS tick. The caller (the
// tracking modal) owns that throttling; this module just does the fetch + traffic-aware
// duration when it's actually called.

let directionsServicePromise = null;

function getDirectionsService() {
  if (!directionsServicePromise) {
    directionsServicePromise = loadGoogleRoutes().then((routesLib) => new routesLib.DirectionsService());
  }
  return directionsServicePromise;
}

// origin/destination: { lat, lng }. Returns { points, distanceKm, durationMinutes } — same
// shape as routingService.js's fetchRoadRoute, so callers can reuse its pointAlongRoute/
// distanceToPolylineKm geometry helpers unmodified. Returns null (never a guess) if the
// Directions API is unavailable or the request fails, so callers can fall back gracefully.
export async function fetchGoogleRoute(origin, destination) {
  try {
    const service = await getDirectionsService();
    const result = await service.route({
      origin,
      destination,
      travelMode: 'DRIVING',
      drivingOptions: { departureTime: new Date(), trafficModel: 'bestguess' },
    });
    const route = result?.routes?.[0];
    const leg = route?.legs?.[0];
    if (!route || !leg) return null;

    const points = (route.overview_path || []).map((point) => ({ lat: point.lat(), lng: point.lng() }));
    if (points.length < 2) return null;

    return {
      points,
      distanceKm: leg.distance.value / 1000,
      // duration_in_traffic needs live-traffic data to be available for the route/time —
      // falls back to the plain (traffic-free) duration whenever Google doesn't return it.
      durationMinutes: (leg.duration_in_traffic?.value ?? leg.duration.value) / 60,
      hasTrafficData: leg.duration_in_traffic != null,
    };
  } catch {
    return null;
  }
}

// The live-navigation map's route (see LiveDeliveryMap.jsx) — same origin/destination/
// return shape as fetchGoogleRoute above, PLUS the two things only the newer Routes API
// (v2, REST — the classic DirectionsService used above has no equivalent) can provide:
// real per-segment traffic speed categories tied to specific stretches of the route
// (`speedIntervals`, NORMAL/SLOW/TRAFFIC_JAM — genuine Google traffic data, never guessed
// or fabricated) and alternate route geometries (`alternativeRoutes`, rendered as plain
// light-gray context lines, no traffic data of their own).
//
// Returns null — never a guess — if the Routes API errors, isn't enabled for this project's
// key, or returns no usable route; callers should fall back to fetchGoogleRoute in that case
// (see LiveDeliveryMap.jsx), which still works against the same API key.
export async function fetchNavigationRoute(origin, destination) {
  try {
    const geometryLib = await loadGoogleGeometry();
    const response = await fetch(`${ROUTES_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-FieldMask': ROUTES_API_FIELD_MASK,
      },
      body: JSON.stringify({
        origin: toWaypoint(origin),
        destination: toWaypoint(destination),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        computeAlternativeRoutes: true,
        extraComputations: ['TRAFFIC_ON_POLYLINE'],
        polylineQuality: 'HIGH_QUALITY',
      }),
    });
    if (!response.ok) return null;

    const data = await response.json();
    const [primary, ...alternatives] = data?.routes || [];
    if (!primary?.polyline?.encodedPolyline) return null;

    const decode = (encoded) => geometryLib.encoding.decodePath(encoded).map((latLng) => ({ lat: latLng.lat(), lng: latLng.lng() }));
    const points = decode(primary.polyline.encodedPolyline);
    if (points.length < 2) return null;

    const speedIntervals = (primary.travelAdvisory?.speedReadingIntervals || [])
      .map((interval) => ({
        startIndex: interval.startPolylinePointIndex || 0,
        endIndex: interval.endPolylinePointIndex ?? points.length - 1,
        speed: SPEED_VALUES.has(interval.speed) ? interval.speed : 'NORMAL',
      }))
      .filter((interval) => interval.endIndex > interval.startIndex);

    return {
      points,
      distanceKm: primary.distanceMeters / 1000,
      // Routes API durations are a protobuf Duration serialized as e.g. "1234s" — parseInt
      // stops at the first non-digit, so this reads the seconds without a regex/slice.
      durationMinutes: Number.parseInt(primary.duration, 10) / 60,
      hasTrafficData: speedIntervals.length > 0,
      speedIntervals,
      alternativeRoutes: alternatives
        .map((route) => (route.polyline?.encodedPolyline ? decode(route.polyline.encodedPolyline) : []))
        .filter((path) => path.length > 1),
    };
  } catch {
    return null;
  }
}
