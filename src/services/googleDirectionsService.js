import { loadGoogleRoutes } from '../lib/googleMapsLoader';

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
