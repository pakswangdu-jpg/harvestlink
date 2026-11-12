import { MAP_COLORS } from '../../lib/mapMarkerColors';

const PIN_PATH = 'M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20C24 5.373 18.627 0 12 0z';

export function buildDonateMapMarkerIcon(mapsApi, width = 28, height = 38, color = MAP_COLORS.stakeholder, {
  alert = false, isYou = false, currentUserGreen = false,
} = {}) {
  const markerColor = isYou && currentUserGreen ? MAP_COLORS.farmer : color;
  const viewBoxHeight = isYou ? 42 : 32;
  const iconHeight = isYou ? height + 12 : height;
  const alertRing = alert
    ? `<circle cx="12" cy="12" r="9" fill="none" stroke="${markerColor}" stroke-width="2.5" opacity="0.45"><animate attributeName="r" values="7;11;7" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.75;0.2;0.75" dur="1.6s" repeatCount="indefinite"/></circle>`
    : '';
  const accountRing = isYou ? `<circle cx="12" cy="12" r="7" fill="#ffffff" stroke="#0c4a6e" stroke-width="2"/>` : '<circle cx="12" cy="12" r="5" fill="#ffffff"/>';
  const accountDot = isYou ? `<circle cx="12" cy="38" r="4" fill="${MAP_COLORS.viewer}" stroke="#ffffff" stroke-width="1.5"/>` : '';
  const svg =
    `<svg width="${width}" height="${iconHeight}" viewBox="0 0 24 ${viewBoxHeight}" xmlns="http://www.w3.org/2000/svg">` +
    `${alertRing}<path d="${PIN_PATH}" fill="${markerColor}" stroke="#ffffff" stroke-width="1.25"/>${accountRing}<text x="12" y="14.5" text-anchor="middle" font-family="Arial,sans-serif" font-size="7" font-weight="700" fill="${markerColor}">S</text>${accountDot}` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(width, iconHeight),
    anchor: new mapsApi.Point(width / 2, isYou ? iconHeight * (38 / viewBoxHeight) : height),
  };
}
