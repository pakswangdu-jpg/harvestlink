import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

if (!apiKey) {
  throw new Error('VITE_GOOGLE_MAPS_API_KEY must be set — see .env.example.');
}

// setOptions() just records config — it must run before the first importLibrary() call,
// but doesn't itself inject the <script> tag or fetch anything.
setOptions({ key: apiKey, v: 'weekly' });

// Google now splits google.maps across several separately-loaded "library" chunks — Map/
// InfoWindow live in "maps", the classic Marker class lives in "marker" (alongside the
// newer AdvancedMarkerElement), and LatLngBounds/Size/Point/event live in "core". Merging
// them into one object here means every caller can destructure whatever it needs without
// having to know or care which chunk a given class actually lives in. importLibrary()
// itself already dedupes concurrent/repeated calls to the same library — the underlying
// <script> tag is only ever injected once no matter how many map components mount.
let mapsPromise = null;
export function loadGoogleMaps() {
  if (!mapsPromise) {
    mapsPromise = Promise.all([
      importLibrary('maps'),
      importLibrary('marker'),
      importLibrary('core'),
    ]).then(([mapsLib, markerLib, coreLib]) => ({ ...mapsLib, ...markerLib, ...coreLib }));
  }
  return mapsPromise;
}

export function loadGoogleGeocoding() {
  return importLibrary('geocoding');
}

// AutocompleteSuggestion/AutocompleteSessionToken/Place live in the "places" library — the
// new (2024+) Places API, not the deprecated google.maps.places.AutocompleteService. Used by
// src/services/placesService.js to back AddressAutocomplete.jsx's as-you-type suggestions.
// Requires the Places API (New) enabled on the same Cloud Console key as Maps JS/Geocoding —
// see .env.example.
export function loadGooglePlaces() {
  return importLibrary('places');
}

// DirectionsService/DirectionsRenderer/TravelMode live in the "routes" library — used by
// src/services/googleDirectionsService.js for the Grab-like live tracking modal. Separate
// from loadGoogleMaps() above (which the existing DeliveryMap.jsx/FarmerMap.jsx use) so
// pages that don't need turn-by-turn directions never pull this library in.
export function loadGoogleRoutes() {
  return importLibrary('routes');
}

// geometry.encoding.decodePath() turns a Routes API v2 encoded polyline string into a real
// { lat, lng }[] array — used by googleDirectionsService.js's fetchNavigationRoute (the
// live-navigation route, see LiveDeliveryMap.jsx). Separate library chunk, only loaded by
// pages that actually need it.
export function loadGoogleGeometry() {
  return importLibrary('geometry');
}

// Optional. A Map ID (Cloud Console -> Maps -> Map Management -> create a vector-rendering
// Map ID, it's free) is what turns on true 3D camera tilt/heading-rotation during live
// navigation (see LiveDeliveryMap.jsx's moveCamera calls) and full-fidelity Advanced
// Markers. Without one, every other navigation feature — the styled/traffic-colored route,
// the rotating vehicle icon, camera follow/zoom, live traffic segments — still works
// exactly the same; only the map's own tilt/rotation is skipped, since that specifically
// requires vector rendering.
export const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || null;
