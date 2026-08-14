// Mirrors src/utils/philippineMobile.js — duplicated, not imported, same reason as
// priceReview.js's own server-side twin of MAX_PLAUSIBLE_PRICE_PER_KG: Render only builds/
// deploys backend/ in isolation, so this file can't reach across to src/. The frontend already
// blocks an invalid/duplicate number in the form, but that's advisory only — this is the check
// that actually can't be bypassed by calling the API directly. Keep both copies in sync by hand.

export const PH_MOBILE_PREFIXES = [
  '0905', '0906', '0907', '0908', '0909',
  '0910', '0912', '0915', '0916', '0917', '0918', '0919',
  '0920', '0921', '0922', '0923', '0925', '0926', '0927', '0928', '0929',
  '0930', '0935', '0936', '0937', '0938', '0939',
  '0945', '0946', '0947', '0948', '0949',
  '0950', '0951', '0953', '0954', '0955', '0956', '0961', '0963', '0965', '0966', '0967', '0968', '0969',
  '0970', '0973', '0975', '0976', '0977', '0978', '0979',
  '0981', '0989', '0994', '0995', '0996', '0997', '0998', '0999',
];

function sanitizePhoneInput(raw) {
  const value = String(raw ?? '');
  const hasLeadingPlus = value.trim().startsWith('+');
  const digits = value.replace(/\D/g, '');
  return hasLeadingPlus ? `+${digits}` : digits;
}

function toLocalDigits(rawValue) {
  const value = sanitizePhoneInput(rawValue);
  if (/^\+63\d{10}$/.test(value)) return `0${value.slice(3)}`;
  if (/^63\d{10}$/.test(value)) return `0${value.slice(2)}`;
  if (/^09\d{9}$/.test(value)) return value;
  return null;
}

export function isValidPhilippineMobile(rawValue) {
  const local = toLocalDigits(rawValue);
  return Boolean(local) && PH_MOBILE_PREFIXES.includes(local.slice(0, 4));
}

export function toE164PhilippineMobile(rawValue) {
  if (!isValidPhilippineMobile(rawValue)) return null;
  const local = toLocalDigits(rawValue);
  return `+63${local.slice(1)}`;
}
