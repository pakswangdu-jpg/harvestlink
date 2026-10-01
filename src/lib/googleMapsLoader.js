import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

if (!apiKey) {
  throw new Error('VITE_GOOGLE_MAPS_API_KEY must be set — see .env.example.');
}


setOptions({ key: apiKey, v: 'weekly' });


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






export function loadGooglePlaces() {
  return importLibrary('places');
}





export function loadGoogleRoutes() {
  return importLibrary('routes');
}





export function loadGoogleGeometry() {
  return importLibrary('geometry');
}








export const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || null;










export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1b2735' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#c4cfdb' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1b2735' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#506174' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#d4dce5' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#d7e0ea' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#aeb9c6' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#20372f' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#9eb9a9' }] },
  { featureType: 'poi.park', elementType: 'labels.text.stroke', stylers: [{ color: '#1b2735' }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#354454' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#c1ccd8' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#405163' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#52677b' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#60788e' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#aebbc8' }] },
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#aeb9c6' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d1d31' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#87a8c5' }] },
];
