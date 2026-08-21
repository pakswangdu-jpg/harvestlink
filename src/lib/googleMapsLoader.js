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

// A classic Maps JS "styles" array (the same mechanism as the JSON produced by Google's own
// Styling Wizard) that recolors the base tiles for dark mode — there's no swappable tile-URL
// here the way a Leaflet/raster map would have, so this is the Google-Maps-native equivalent
// of a dark tile set. Applied by every map component (see their `styles:` map option / a
// `setOptions({ styles })` call keyed off ThemeContext's `effectiveTheme`) so the base map
// itself doesn't stay a bright daytime tile inside an otherwise dark-themed page. NOT used on
// a vector map that has a real Map ID (GOOGLE_MAPS_MAP_ID) — the JS API ignores (and warns
// about) a `styles` array whenever `mapId` is set, since a vector map's styling is controlled
// from the Cloud Console instead.
export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#757575' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181818' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'poi.park', elementType: 'labels.text.stroke', stylers: [{ color: '#1b1b1b' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#373737' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#4e4e4e' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1a2b' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d5a80' }] },
];
