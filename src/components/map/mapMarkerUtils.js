const ROLE_LABELS = {
  farmer: 'Farmer',
  buyer: 'Buyer',
  stakeholder: 'Stakeholder',
  viewer: 'Your location',
};
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function projectToWorldPixels(position, zoom) {
  const scale = 256 * (2 ** zoom);
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, position.lat));
  const sine = Math.sin((latitude * Math.PI) / 180);
  return {
    x: ((position.lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * scale,
    scale,
  };
}

export function getRoleMarkerKey(role, userId) {
  return `${role}:${String(userId)}`;
}

export function uniqueProfilesById(profiles = []) {
  const byId = new Map();
  profiles.forEach((profile) => {
    if (profile?.id != null && profile.id !== '') byId.set(String(profile.id), profile);
  });
  return [...byId.values()];
}

export function getOverlappingMarkerEntries(entries, targetKey, zoom, radius = 48) {
  const target = entries.find((entry) => entry.key === targetKey);
  if (!target || !Number.isFinite(target.position?.lat) || !Number.isFinite(target.position?.lng)) return [];

  return entries.filter((entry) => {
    if (entry.key === targetKey || !Number.isFinite(entry.position?.lat) || !Number.isFinite(entry.position?.lng)) return false;
    const dLat = Math.abs(entry.position.lat - target.position.lat);
    const dLng = Math.abs(entry.position.lng - target.position.lng);
    if (dLat > 0.001 || dLng > 0.001) return false;
    const point = projectToWorldPixels(entry.position, zoom);
    const targetPoint = projectToWorldPixels(target.position, zoom);
    const rawDx = Math.abs(point.x - targetPoint.x);
    const dx = Math.min(rawDx, targetPoint.scale - rawDx);
    const dy = Math.abs(point.y - targetPoint.y);
    return Math.hypot(dx, dy) <= radius;
  });
}

function coordinatesOf(position) {
  if (!position) return null;
  const lat = typeof position.lat === 'function' ? position.lat() : Number(position.lat);
  const lng = typeof position.lng === 'function' ? position.lng() : Number(position.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function syncMarkerPositions(entries) {
  entries.forEach((entry) => {
    if (!entry?.position || !entry?.marker?.setPosition) return;
    const currentPosition = coordinatesOf(entry.marker.getPosition?.() || entry.marker.position);
    if (!currentPosition
      || Math.abs(currentPosition.lat - entry.position.lat) > 1e-10
      || Math.abs(currentPosition.lng - entry.position.lng) > 1e-10) {
      entry.marker.setPosition(entry.position);
    }
    if (entry.layoutAnchor && entry.icon && entry.marker.setIcon) {
      entry.marker.setIcon(entry.icon);
      entry.layoutAnchor = null;
    }
    if (entry.connectorLine) {
      entry.connectorLine.setMap?.(null);
      entry.connectorLine = null;
    }
    entry.displayPosition = entry.position;
  });
}

export function focusSelectedProfileMarker(map, mapsApi, selectedPosition, currentAccountPosition, isCurrentUser) {
  const samePosition = currentAccountPosition
    && Math.abs(currentAccountPosition.lat - selectedPosition.lat) <= 1e-10
    && Math.abs(currentAccountPosition.lng - selectedPosition.lng) <= 1e-10;
  if (isCurrentUser || !currentAccountPosition || samePosition) {
    map.panTo(selectedPosition);
    map.setZoom(13);
    return;
  }

  const bounds = new mapsApi.LatLngBounds();
  bounds.extend(currentAccountPosition);
  bounds.extend(selectedPosition);
  map.fitBounds(bounds, 40);
  mapsApi.event.addListenerOnce(map, 'idle', () => {
    if (map.getZoom() > 13) map.setZoom(13);
  });
}

export function applyMarkerStackLayout(entries) {
  syncMarkerPositions(entries);
}

export function buildOverlappingPopupMarkup(popupHtml, entry, peers) {
  if (!peers.length) return popupHtml;
  const accounts = peers.map((peer) => {
    const role = ROLE_LABELS[peer.role] || 'Account';
    const name = peer.title || 'Registered user';
    return `<button type="button" data-marker-key="${escapeHtml(peer.key)}" aria-label="Open ${escapeHtml(role)}: ${escapeHtml(name)}"><span>${escapeHtml(role)}</span><strong>${escapeHtml(name)}</strong></button>`;
  }).join('');
  return `${popupHtml}<div class="map-popup-overlap" data-owner-key="${escapeHtml(entry.key)}" role="group" aria-label="Other accounts at this location"><small>${peers.length} other ${peers.length === 1 ? 'account shares' : 'accounts share'} this location</small>${accounts}</div>`;
}

export function bindOverlappingMarkerSelection(infoWindow, entriesRef, mapsApi) {
  const boundLists = new WeakSet();
  return infoWindow.addListener('domready', () => {
    const list = [...document.querySelectorAll('.gm-style-iw .map-popup-overlap')]
      .find((element) => element.dataset.ownerKey === infoWindow.mapMarkerKey);
    if (!list || boundLists.has(list)) return;
    boundLists.add(list);
    list.addEventListener('click', (event) => {
      const button = event.target instanceof Element
        ? event.target.closest('button[data-marker-key]')
        : null;
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      const entries = entriesRef.current;
      const target = entries instanceof Map ? entries.get(button.dataset.markerKey) : entries[button.dataset.markerKey];
      if (target) mapsApi.event.trigger(target.marker, 'click');
    });
  });
}

export function createProfileMarkerEntry({
  role, userId, title, marker, infoWindow, popupHtml, position, icon, isCurrentUser = false,
}, map, mapsApi, entriesRef, openInfoWindowRef) {
  const entry = {
    key: getRoleMarkerKey(role, userId),
    role,
    userId: String(userId),
    title,
    marker,
    infoWindow,
    popupHtml,
    position,
    icon,
    isCurrentUser,
    baseZIndex: marker.getZIndex?.() ?? null,
  };
  infoWindow.mapMarkerKey = entry.key;
  entry.clickListener = marker.addListener('click', () => {
    showProfileMarkerInfo(map, mapsApi, entry, entriesRef, openInfoWindowRef);
  });
  entry.overlapDomReadyListener = bindOverlappingMarkerSelection(infoWindow, entriesRef, mapsApi);
  entriesRef.current.set(entry.key, entry);
  return entry;
}

export function showProfileMarkerInfo(map, mapsApi, entry, entriesRef, openInfoWindowRef) {
  const entries = entriesRef.current instanceof Map
    ? [...entriesRef.current.values()]
    : Object.values(entriesRef.current);
  entries.forEach((candidate) => {
    if (!Object.hasOwn(candidate, 'baseZIndex')) {
      candidate.baseZIndex = candidate.zIndex ?? candidate.marker.getZIndex?.() ?? null;
    }
    candidate.isSelected = candidate === entry;
    candidate.marker.setZIndex?.(candidate === entry ? 1100 : candidate.baseZIndex);
  });
  applyMarkerStackLayout(entries);
  const peers = getOverlappingMarkerEntries(entries, entry.key, map.getZoom() || 0);
  entry.infoWindow.setContent(buildOverlappingPopupMarkup(entry.popupHtml, entry, peers));
  if (openInfoWindowRef.current && openInfoWindowRef.current !== entry.infoWindow) {
    openInfoWindowRef.current.close();
  }
  entry.infoWindow.open({ map, anchor: entry.marker });
  openInfoWindowRef.current = entry.infoWindow;
}

export function removeProfileMarkerEntry(entry, entriesRef) {
  if (!entry) return;
  entry.clickListener?.remove?.();
  entry.overlapDomReadyListener?.remove?.();
  entry.connectorLine?.setMap?.(null);
  entry.marker?.setMap?.(null);
  entry.infoWindow?.close?.();
  entriesRef?.current?.delete?.(entry.key);
}
