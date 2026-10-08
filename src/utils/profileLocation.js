import { CEBU_MUNICIPALITIES } from './constants';

export function findMunicipality(...values) {
  const candidates = values.flatMap((value) => String(value || '').split(',').map((part) => part.trim().toLowerCase()));
  const normalize = (value) => value.replace(/^(?:city|municipality)\s+of\s+/, '')
    .replace(/\s+city$/, '').replace(/[\s-]+/g, '');
  for (const candidate of candidates) {
    const match = CEBU_MUNICIPALITIES.find((municipality) => normalize(candidate) === normalize(municipality.toLowerCase()));
    if (match) return match;
  }
  return null;
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
