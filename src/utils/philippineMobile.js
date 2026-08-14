// Philippine mobile number validation — accepts 09XXXXXXXXX, +639XXXXXXXXX, or 639XXXXXXXXX,
// validates the network prefix against the real list NTC-assigned ranges are issued from, and
// normalizes anything valid to a single canonical storage form (+639XXXXXXXXX). Mirrored
// server-side in backend/src/lib/philippineMobile.js — see that file's own comment for why
// it's duplicated rather than imported (Render only builds/deploys backend/ in isolation).

// Every legitimate Globe/Smart/DITO/Sun mobile prefix in current use, as 4 digits including
// the leading 0 (e.g. "0917"). Anything not on this list is rejected even if it's otherwise
// 11 digits starting with 09 — a landline area code or an unissued range should never pass.
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

// Strips spaces/dashes/parentheses (and any other stray character) as the user types, keeping
// only digits and a single leading "+" if they typed one — "0917-123-4567" becomes
// "09171234567", "+63 917 123 4567" becomes "+639171234567". Never rejects anything here;
// this only cleans the input, isValidPhilippineMobile below is what actually validates it.
export function sanitizePhoneInput(raw) {
  const value = String(raw ?? '');
  const hasLeadingPlus = value.trim().startsWith('+');
  const digits = value.replace(/\D/g, '');
  return hasLeadingPlus ? `+${digits}` : digits;
}

// Reduces any of the 3 accepted shapes (09XXXXXXXXX / +639XXXXXXXXX / 639XXXXXXXXX) down to
// the plain 11-digit local form (09XXXXXXXXX) so prefix/length checks only need to be written
// once. Returns null for anything that isn't recognizably one of those 3 shapes at all
// (too short/long, wrong country code, letters left over, etc.).
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

// The canonical storage form — null if the input isn't a valid PH mobile number at all,
// so a caller can't accidentally persist a malformed value by skipping the validity check.
export function toE164PhilippineMobile(rawValue) {
  if (!isValidPhilippineMobile(rawValue)) return null;
  const local = toLocalDigits(rawValue);
  return `+63${local.slice(1)}`;
}
