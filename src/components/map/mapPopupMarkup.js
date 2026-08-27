import { isRecentlyActive } from '../../utils/formatters';

const ICON_PATHS = {
  location: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92Z"/>',
  message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
};

export function popupIcon(name, className = '') {
  return `<svg class="map-popup-icon${className ? ` ${className}` : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

export function buildPresenceMarkup(person) {
  const online = isRecentlyActive(person.lastActiveAt);
  return `<span class="presence-dot ${online ? 'online' : 'offline'}"></span>${online ? 'Online' : 'Offline'}`;
}

export function buildMapPopup({
  name, person, municipality, contactNumber, presence, precision, products, links = [],
}) {
  return (
    `<div class="map-popup">` +
    `<strong class="map-popup-name">${name}</strong>` +
    (person ? `<span class="map-popup-person">${person}</span>` : '') +
    `<span class="map-popup-row map-popup-location">${popupIcon('location')}${municipality}</span>` +
    (contactNumber ? `<span class="map-popup-row map-popup-phone">${popupIcon('phone')}${contactNumber}</span>` : '') +
    (presence ? `<span class="map-popup-row map-popup-presence">${presence}</span>` : '') +
    `<small class="map-popup-meta">${precision}</small>` +
    (products ? `<span class="map-popup-products">${products}</span>` : '') +
    links.map(({ href, label }) => (
      `<a class="map-popup-contact" href="${href}">${popupIcon('message')}${label}${popupIcon('chevron', 'map-popup-chevron')}</a>`
    )).join('') +
    `</div>`
  );
}
