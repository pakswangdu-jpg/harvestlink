import { MAP_COLORS } from '../../lib/mapMarkerColors';
import { buildDonateMapMarkerIcon } from './donateMapMarkerIcon';

export function buildStakeholderMapMarkerIcon(mapsApi, {
  alert = false, isYou = false, currentUserGreen = false, width = 28, height = 38,
} = {}) {
  return buildDonateMapMarkerIcon(mapsApi, width, height, MAP_COLORS.stakeholder, { alert, isYou, currentUserGreen });
}
