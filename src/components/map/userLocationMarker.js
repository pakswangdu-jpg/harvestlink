import { MAP_COLORS } from '../../lib/mapMarkerColors';

export function buildViewerIcon(mapsApi) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="${MAP_COLORS.viewer}" fill-opacity=".14"/><circle cx="16" cy="16" r="8" fill="white"/><circle cx="16" cy="16" r="5.5" fill="${MAP_COLORS.viewer}"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(32, 32),
    anchor: new mapsApi.Point(16, 16),
  };
}

export function buildViewerPopup(address = '') {
  const escaped = String(address).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  return `<div class="map-popup"><strong class="map-popup-name">Your location</strong>${escaped ? `<span class="map-popup-person">${escaped}</span>` : ''}<small class="map-popup-meta">Used for nearby sorting.</small></div>`;
}
