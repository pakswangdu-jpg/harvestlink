export const DONATION_MARKER_COLOR = '#d94b43';

export function isDonationAlert(person, coords) {
  return person?.hasAvailableDonations === true && coords?.precision === 'registered';
}

export function donationAnimation(mapsApi, alert) {
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return alert && !reducedMotion ? mapsApi.Animation.BOUNCE : null;
}
