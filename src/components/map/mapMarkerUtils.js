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

  const targetPoint = projectToWorldPixels(target.position, zoom);
  return entries.filter((entry) => {
    if (entry.key === targetKey || !Number.isFinite(entry.position?.lat) || !Number.isFinite(entry.position?.lng)) return false;
    const point = projectToWorldPixels(entry.position, zoom);
    const rawDx = Math.abs(point.x - targetPoint.x);
    const dx = Math.min(rawDx, targetPoint.scale - rawDx);
    const dy = Math.abs(point.y - targetPoint.y);
    return Math.hypot(dx, dy) <= radius;
  });
}

function getEntrySize(entry) {
  return {
    width: entry.icon?.scaledSize?.width || 40,
    height: entry.icon?.scaledSize?.height || 48,
  };
}

export function getMarkerStackLayouts(entries, zoom, gap = 4, radius = 48) {
  const remaining = new Set(entries.filter((entry) => (
    Number.isFinite(entry.position?.lat) && Number.isFinite(entry.position?.lng)
  )));
  const layouts = new Map();

  while (remaining.size) {
    const seed = remaining.values().next().value;
    const group = [seed];
    remaining.delete(seed);
    for (let index = 0; index < group.length; index += 1) {
      const current = group[index];
      const peers = getOverlappingMarkerEntries(entries, current.key, zoom, radius);
      peers.forEach((peer) => {
        if (!remaining.has(peer)) return;
        remaining.delete(peer);
        group.push(peer);
      });
    }

    if (group.length < 2) continue;
    group.sort((left, right) => (
      Number(right.role === 'stakeholder') - Number(left.role === 'stakeholder')
      || left.key.localeCompare(right.key)
    ));
    const sizes = group.map(getEntrySize);
    const maxHeight = Math.max(...sizes.map((size) => size.height));
    const totalWidth = sizes.reduce((sum, size) => sum + size.width, 0) + gap * (group.length - 1);
    let left = -totalWidth / 2;
    group.forEach((entry, index) => {
      const size = sizes[index];
      layouts.set(entry.key, {
        x: left + size.width / 2,
        y: (maxHeight - size.height) / 2,
      });
      left += size.width + gap;
    });
  }
  return layouts;
}

export function applyMarkerStackLayout(entries, zoom, mapsApi) {
  if (!mapsApi?.Point) return;
  const layouts = getMarkerStackLayouts(entries, zoom);
  entries.forEach((entry) => {
    if (!entry?.icon || !entry?.marker?.setIcon) return;
    const offset = layouts.get(entry.key) || { x: 0, y: 0 };
    const originalAnchor = entry.icon.anchor || { x: (entry.icon.scaledSize?.width || 40) / 2, y: entry.icon.scaledSize?.height || 48 };
    entry.marker.setIcon({
      ...entry.icon,
      anchor: new mapsApi.Point(originalAnchor.x - offset.x, originalAnchor.y - offset.y),
    });
  });
}

export function buildOverlappingPopupMarkup(popupHtml, entry, peers) {
  if (!peers.length) return popupHtml;
  const accounts = peers.map((peer) => {
    const role = ROLE_LABELS[peer.role] || 'Account';
    const name = peer.title || 'Registered user';
    return `<button type="button" data-marker-key="${escapeHtml(peer.key)}" aria-label="Open ${escapeHtml(role)}: ${escapeHtml(name)}"><span>${escapeHtml(role)}</span><strong>${escapeHtml(name)}</strong></button>`;
  }).join('');
  return `${popupHtml}<div class="map-popup-overlap" data-owner-key="${escapeHtml(entry.key)}" role="group" aria-label="Other accounts at this location"><small>${peers.length} other ${peers.length === 1 ? 'account is' : 'accounts are'} nearby</small>${accounts}</div>`;
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
  role, userId, title, marker, infoWindow, popupHtml, position, icon,
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
  entry.marker?.setMap?.(null);
  entry.infoWindow?.close?.();
  entriesRef?.current?.delete?.(entry.key);
}
