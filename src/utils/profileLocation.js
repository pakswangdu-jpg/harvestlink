import { CEBU_MUNICIPALITIES } from './constants';

function findMunicipality(...values) {
  const candidates = values.flatMap((value) => String(value || '').split(',').map((part) => part.trim().toLowerCase()));
  const exactMatch = CEBU_MUNICIPALITIES.find((municipality) => candidates.includes(municipality.toLowerCase()));
  if (exactMatch) return exactMatch;

  const primaryValue = String(values[0] || '').trim().toLowerCase().replace(/\s+city$/, '');
  return CEBU_MUNICIPALITIES.find(
    (municipality) => municipality.toLowerCase().replace(/\s+city$/, '') === primaryValue,
  ) || null;
}

export function getProfileLocationFromPlace(details, currentValues = {}) {
  const lat = details.lat;
  const lng = details.lng;
  const hasCoordinates = Number.isFinite(lat)
    && Number.isFinite(lng)
    && Math.abs(lat) <= 90
    && Math.abs(lng) <= 180;

  return {
    address: details.formattedAddress?.trim() || currentValues.address || '',
    municipality: findMunicipality(details.municipality, details.formattedAddress) || currentValues.municipality,
    latitude: hasCoordinates ? lat : null,
    longitude: hasCoordinates ? lng : null,
    zipCode: details.zipCode || '',
  };
}
