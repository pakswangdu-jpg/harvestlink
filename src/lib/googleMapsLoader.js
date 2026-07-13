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
