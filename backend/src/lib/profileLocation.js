import { ApiError } from './ApiError.js';

export function profileLocationFields(values) {
  if (values.latitude === undefined && values.longitude === undefined) return {};
  if (values.latitude === null && values.longitude === null) return { latitude: null, longitude: null };

  const valid = (value, limit) => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
    && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit;

  if (!valid(values.latitude, 90) || !valid(values.longitude, 180)) {
    throw new ApiError('Choose a valid profile location with both latitude and longitude.', 400);
  }

  return { latitude: Number(values.latitude), longitude: Number(values.longitude) };
}
