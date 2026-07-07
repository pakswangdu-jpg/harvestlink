import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

setOptions({ key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY, v: 'weekly' });

let loadPromise = null;

// Shared across every map component so the API script is only ever loaded once, no
// matter how many maps are mounted on the page. `Marker` (and the pin animation enum)
// live in the "marker" library, not "maps" — both must be imported for either to resolve.
export function loadGoogleMaps() {
  if (!loadPromise) {
    loadPromise = Promise.all([importLibrary('maps'), importLibrary('marker')]).then(() => window.google.maps);
  }
  return loadPromise;
}
