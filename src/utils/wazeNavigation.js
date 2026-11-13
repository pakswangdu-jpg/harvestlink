import { validateCoordinates } from './geo';

export function buildWazeNavigationUrl(destination) {
  const coordinates = validateCoordinates(destination?.lat, destination?.lng);
  if (!coordinates) return null;

  const location = encodeURIComponent(`${coordinates.lat},${coordinates.lng}`);
  return `https://waze.com/ul?ll=${location}&navigate=yes`;
}
