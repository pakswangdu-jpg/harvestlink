import { isRecentlyActive } from '../../utils/formatters';

const ICON_PATHS = {
  location: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z"/>',
  message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  verified: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/>',
  package: '<path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/>',
};

const ROLE_META = {
  farmer: { label: 'Farmer', tone: 'farmer' },
  buyer: { label: 'Buyer', tone: 'buyer' },
  stakeholder: { label: 'Stakeholder', tone: 'stakeholder' },
};

export function popupIcon(name, className = '') {
  return `<svg class="map-popup-icon${className ? ` ${className}` : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.message}</svg>`;
}

export function buildPresenceMarkup(person) {
  const online = isRecentlyActive(person.lastActiveAt);
  return `<span class="presence-dot ${online ? 'online' : 'offline'}"></span>${online ? 'Online' : 'Offline'}`;
}

function escapeAttribute(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function formatFullAddress(address, barangay, municipality, zipCode = '') {
  const parts = String(address || '').split(',').map((part) => part.trim()).filter(Boolean);
  const normalize = (part) => part.toLocaleLowerCase();
  const hasPart = (value) => parts.some((part) => normalize(part) === normalize(value));
  const barangayPart = String(barangay || '').trim();
  const municipalityPart = String(municipality || '').trim();
  const zipPart = String(zipCode || '').trim();
  const cityIndex = municipalityPart
    ? parts.findIndex((part) => normalize(part) === normalize(municipalityPart))
    : -1;

  if (barangayPart && !hasPart(barangayPart)) {
    if (cityIndex >= 0) parts.splice(cityIndex, 0, barangayPart);
    else parts.push(barangayPart);
  }
  if (municipalityPart && !hasPart(municipalityPart)) parts.push(municipalityPart);
  if (zipPart && !hasPart(zipPart)) parts.push(zipPart);

  return parts.filter((part, index) => (
    parts.findIndex((candidate) => normalize(candidate) === normalize(part)) === index
  )).join(', ') || 'Location unavailable';
}

export function getDirectionsUrl({ coords, address, barangay, municipality }) {
  const lat = Number(coords?.lat);
  const lng = Number(coords?.lng);
  const hasCoordinates = Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180;

  const registeredLocation = [address, barangay, municipality]
    .map((part) => String(part || '').trim())
    .filter((part, index, parts) => part && parts.indexOf(part) === index);
  const destination = hasCoordinates
    ? `${lat},${lng}`
    : registeredLocation.length
      ? [...registeredLocation, 'Cebu, Philippines'].join(', ')
      : '';

  if (!destination) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

export function buildMapPopup({
  name,
  person,
  roleLabel = '',
  roleTone = '',
  verificationLabel = '',
  metaDetails = [],
  municipality,
  address,
  barangay,
  zipCode,
  coords,
  contactNumber,
  presence,
  precision,
  products,
  links = [],
  fullAddress = false,
  detailsMarkerKey = '',
  detailsLabel = 'See details',
}) {
  const locationLabel = fullAddress
    ? formatFullAddress(address, barangay, municipality, zipCode)
    : [address, barangay, municipality]
      .map((part) => String(part || '').trim())
      .find(Boolean) || 'Location unavailable';
  const escapedLocationLabel = escapeAttribute(locationLabel);
  const directionsUrl = getDirectionsUrl({ coords, address, barangay, municipality });
  const locationMarkup = directionsUrl
    ? `<a class="map-popup-row map-popup-location map-popup-location-link" href="${escapeAttribute(directionsUrl)}" target="_blank" rel="noopener noreferrer" title="Open in Google Maps" aria-label="Open ${escapedLocationLabel} in Google Maps">${popupIcon('location')}<span class="map-popup-location-text">${escapedLocationLabel}</span></a>`
    : `<span class="map-popup-row map-popup-location map-popup-location-disabled" aria-disabled="true">${popupIcon('location')}<span class="map-popup-location-text">${escapedLocationLabel}</span></span>`;

  const badges = [
    roleLabel ? `<span class="map-popup-badge is-${escapeAttribute(roleTone || roleLabel.toLowerCase())}">${escapeAttribute(roleLabel)}</span>` : '',
    verificationLabel ? `<span class="map-popup-badge is-verified">${popupIcon('verified')}${escapeAttribute(verificationLabel)}</span>` : '',
  ].filter(Boolean).join('');

  const detailItems = (Array.isArray(metaDetails) ? metaDetails : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  const normalizedPhone = String(contactNumber || '').trim();
  const escapedPhone = escapeAttribute(normalizedPhone);
  const phoneMarkup = normalizedPhone
    ? `<a class="map-popup-row map-popup-phone map-popup-phone-link" href="tel:${escapeAttribute(normalizedPhone.replace(/\s+/g, ''))}">${popupIcon('phone')}<span>${escapedPhone}</span></a>`
    : '';

  const detailsButtonMarkup = detailsMarkerKey
    ? `<button type="button" class="map-popup-details-btn" data-details-marker-key="${escapeAttribute(detailsMarkerKey)}">${popupIcon('user')}<span>${escapeAttribute(detailsLabel)}</span>${popupIcon('chevron', 'map-popup-chevron')}</button>`
    : '';

  return (
    `<div class="map-popup">` +
    (badges ? `<div class="map-popup-badges">${badges}</div>` : '') +
    `<strong class="map-popup-name">${escapeAttribute(name)}</strong>` +
    (person ? `<span class="map-popup-person">${escapeAttribute(person)}</span>` : '') +
    locationMarkup +
    phoneMarkup +
    (presence ? `<span class="map-popup-row map-popup-presence">${presence}</span>` : '') +
    (detailItems.length
      ? `<div class="map-popup-details-list">${detailItems.map((item) => `<span class="map-popup-detail-chip">${escapeAttribute(item)}</span>`).join('')}</div>`
      : '') +
    `<small class="map-popup-meta">${escapeAttribute(precision)}</small>` +
    (products ? `<span class="map-popup-products">${products}</span>` : '') +
    detailsButtonMarkup +
    links.map(({ href, label, icon = 'message' }) => (
      `<a class="map-popup-contact" href="${escapeAttribute(href)}">${popupIcon(icon)}${escapeAttribute(label)}${popupIcon('chevron', 'map-popup-chevron')}</a>`
    )).join('') +
    `</div>`
  );
}

export function buildRoleMapPopup({
  profile,
  role,
  coords,
  precision,
  isYou = false,
  productsHtml = '',
  links = [],
  markerKey = '',
}) {
  const roleMeta = ROLE_META[role] || { label: 'Member', tone: 'buyer' };
  const baseName = role === 'farmer'
    ? (profile.farmName || profile.name)
    : role === 'stakeholder'
      ? (profile.organizationName || profile.name)
      : profile.name;
  const displayName = isYou ? `${baseName} (You)` : baseName;

  const person = role === 'farmer'
    ? (profile.farmName && profile.name && profile.farmName !== profile.name ? profile.name : profile.name)
    : role === 'stakeholder'
      ? (profile.contactPerson || (profile.organizationName && profile.name !== profile.organizationName ? profile.name : ''))
      : '';

  const verificationLabel = ['farmer', 'stakeholder'].includes(role) && profile.verificationStatus === 'verified'
    ? 'Verified'
    : '';

  const metaDetails = [];
  if (role === 'farmer') {
    const ratingCount = Number(profile.ratingCount || 0);
    const avgRating = Number(profile.avgRating || 0);
    if (ratingCount > 0) metaDetails.push(`${avgRating.toFixed(1)}★ (${ratingCount})`);
    const productCount = Number(profile.productCount || 0);
    if (productCount > 0) {
      metaDetails.push(`${productCount} active ${productCount === 1 ? 'listing' : 'listings'}`);
    }
    if (Array.isArray(profile.categories) && profile.categories.length) {
      metaDetails.push(profile.categories.slice(0, 2).join(', '));
    }
  } else if (role === 'stakeholder') {
    if (profile.organizationType) metaDetails.push(profile.organizationType);
  }

  return buildMapPopup({
    name: displayName,
    person,
    roleLabel: roleMeta.label,
    roleTone: roleMeta.tone,
    verificationLabel,
    metaDetails,
    municipality: profile.municipality,
    address: profile.address,
    barangay: profile.barangay,
    zipCode: profile.zipCode,
    coords,
    contactNumber: profile.contactNumber,
    presence: buildPresenceMarkup(profile),
    precision,
    products: productsHtml,
    links,
    fullAddress: true,
    detailsMarkerKey: markerKey,
    detailsLabel: 'See details',
  });
}
