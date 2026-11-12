export const MAX_REGISTRATION_LOCATION_ACCURACY_METERS = 100;

export function isAcceptableRegistrationLocationAccuracy(value) {
  const hasValue = typeof value === 'number'
    || (typeof value === 'string' && value.trim() !== '');
  const accuracy = Number(value);
  return hasValue
    && Number.isFinite(accuracy)
    && accuracy >= 0
    && accuracy <= MAX_REGISTRATION_LOCATION_ACCURACY_METERS;
}

export function hasAcceptableRegistrationLocation(values) {
  const isCoordinate = (value, limit) => (
    typeof value === 'number'
    || (typeof value === 'string' && value.trim() !== '')
  ) && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit;

  return isCoordinate(values?.latitude, 90)
    && isCoordinate(values?.longitude, 180)
    && isAcceptableRegistrationLocationAccuracy(values?.locationAccuracyMeters);
}
