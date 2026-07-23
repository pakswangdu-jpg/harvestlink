import { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { loadGoogleMaps } from '../../lib/googleMapsLoader';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';
import { isRecentlyActive } from '../../utils/formatters';

const CEBU_CENTER = { lat: 10.3157, lng: 123.8854 };

const PRECISION_LABELS = {
  address: 'Exact registered address',
  municipality: 'Approximate — municipality center',
  fallback: 'Approximate — municipality area',
};

// A dot + label rather than just a color, since the pin's own fixed color already means
// "farmer" / "buyer" / "donation" — presence needs its own independent visual.
function presenceHtml(person) {
  const online = isRecentlyActive(person.lastActiveAt);
  return `<span class="presence-dot ${online ? 'online' : 'offline'}"></span> ${online ? 'Online' : 'Offline'}`;
}

// Classic teardrop map-pin shape (rounded head + pointed tail) with a white hole punched
// through the head, rather than a plain colored dot — the tail's tip is the actual pinned
// location, so the icon's anchor sits there instead of at its center. `alert` bakes in a
// static ring around the head (used for donation pins) — a plain data-URI <img> icon can't
// run a CSS pulse animation the way the old Leaflet divIcon could, so this is a static
// stand-in for that same "notice me" treatment.
const PIN_PATH = 'M12 0C5.373 0 0 5.373 0 12c0 9 12 20 12 20s12-11 12-20C24 5.373 18.627 0 12 0z';

function buildPinIcon(mapsApi, color, { alert = false } = {}) {
  const alertRing = alert
    ? `<circle cx="12" cy="12" r="9" fill="none" stroke="${color}" stroke-width="2.5" opacity="0.45"/>`
    : '';
  const svg =
    `<svg width="28" height="38" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">` +
    `${alertRing}<path d="${PIN_PATH}" fill="${color}"/><circle cx="12" cy="12" r="5.5" fill="white"/>` +
    `</svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new mapsApi.Size(28, 38),
    anchor: new mapsApi.Point(14, 38),
  };
}

const EMPTY_SET = new Set();

export default function FarmerMap({
  farmers = [],
  buyers = [],
  stakeholders = [],
  donationFarmers = [],
  selectedId,
  onSelectPin,
  farmersWithProducts = EMPTY_SET,
  currentUserId,
  existingThreadIds = EMPTY_SET,
}) {
  const wrapperRef = useRef(null);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mapsApiRef = useRef(null);
  const markersRef = useRef({});
  const openInfoWindowRef = useRef(null);
  const fittedSignatureRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const farmerCoordsById = useMapCoordinates(farmers);
  const buyerCoordsById = useMapCoordinates(buyers);
  const stakeholderCoordsById = useMapCoordinates(stakeholders);
  const donationFarmerCoordsById = useMapCoordinates(donationFarmers);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      wrapperRef.current?.requestFullscreen();
    }
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    let cancelled = false;

    loadGoogleMaps().then((mapsApi) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = new mapsApi.Map(containerRef.current, {
        center: CEBU_CENTER,
        zoom: 9,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        clickableIcons: false,
      });
      mapRef.current = map;
      mapsApiRef.current = mapsApi;
      setMapReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // The container's real size is only final after the CSS grid layout settles, which can
  // happen after Google's own initial measurement (and again on the fullscreen toggle)
  // — without re-triggering 'resize' and restoring the center, panning/zooming can look
  // subtly broken or the map can appear blank until manually nudged.
  useEffect(() => {
    if (!mapReady || !containerRef.current) return undefined;
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    const resizeObserver = new ResizeObserver(() => {
      const center = map.getCenter();
      mapsApi.event.trigger(map, 'resize');
      if (center) map.setCenter(center);
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    if (!mapReady || !map || !mapsApi) return;

    const seenIds = new Set();
    const allPoints = [];

    function openInfoWindow(marker, infoWindow) {
      if (openInfoWindowRef.current && openInfoWindowRef.current !== infoWindow) {
        openInfoWindowRef.current.close();
      }
      infoWindow.open({ map, anchor: marker });
      openInfoWindowRef.current = infoWindow;
    }

    // Farmers/buyers refresh on a poll (see FarmerMapPage) so presence dots and the
    // contactable-farmer set stay live — tearing down and recreating every marker on each
    // refresh would close any info window the user currently has open (e.g. right as
    // they're about to click "Contact farmer"). Updating existing markers in place via
    // setPosition/InfoWindow.setContent instead means an open window's content refreshes
    // live without ever closing.
    function upsertMarker(id, coords, buildIcon, popupHtml, onClick) {
      seenIds.add(id);
      allPoints.push(coords);
      const existing = markersRef.current[id];
      if (existing) {
        existing.marker.setPosition(coords);
        existing.infoWindow.setContent(popupHtml);
        return;
      }
      const marker = new mapsApi.Marker({ position: coords, map, icon: buildIcon() });
      const infoWindow = new mapsApi.InfoWindow({ content: popupHtml });
      marker.addListener('click', () => {
        openInfoWindow(marker, infoWindow);
        if (onClick) onClick();
      });
      markersRef.current[id] = { marker, infoWindow };
    }

    farmers.forEach((farmer) => {
      const coords = farmerCoordsById[farmer.id];
      if (!coords) return;

      const isYou = farmer.id === currentUserId;
      const realDisplayName = farmer.farmName || farmer.name;
      const displayName = isYou ? 'You' : realDisplayName;
      const hasProducts = farmersWithProducts.has(farmer.id);
      const productsLine = hasProducts
        ? `<br/><a href="/marketplace?farmerId=${farmer.id}&farmerName=${encodeURIComponent(realDisplayName)}">View products</a>`
        : `<br/><small class="muted">No products available</small>`;
      // "Contact farmer" only continues an existing conversation — it can't be used to cold-
      // message a stranger browsed off the map. `existingThreadIds` comes from the viewer's
      // real direct-message threads (see getDirectThreads()), so this is a real relationship
      // check, not a guess.
      const contactLine = isYou
        ? ''
        : existingThreadIds.has(farmer.id)
          ? `<br/><a href="/messages/direct/${farmer.id}">Contact farmer</a>`
          : `<br/><small class="muted">No conversation yet</small>`;
      const popupHtml =
        `<strong>${displayName}</strong><br/>` +
        `${farmer.name}<br/>` +
        `${farmer.municipality}` +
        (farmer.contactNumber ? `<br/>${farmer.contactNumber}` : '') +
        `<br/>${presenceHtml(farmer)}` +
        `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>` +
        productsLine +
        contactLine;
      upsertMarker(farmer.id, coords, () => buildPinIcon(mapsApi, '#15803d'), popupHtml, onSelectPin && (() => onSelectPin(farmer.id)));
    });

    buyers.forEach((buyer) => {
      const coords = buyerCoordsById[buyer.id];
      if (!coords) return;

      const isYou = buyer.id === currentUserId;
      const contactLine = isYou
        ? ''
        : existingThreadIds.has(buyer.id)
          ? `<br/><a href="/messages/direct/${buyer.id}">Contact buyer</a>`
          : `<br/><small class="muted">No conversation yet</small>`;
      const popupHtml =
        `<strong>${isYou ? 'You' : buyer.name}</strong><br/>` +
        `${buyer.municipality}` +
        (buyer.contactNumber ? `<br/>${buyer.contactNumber}` : '') +
        `<br/>${presenceHtml(buyer)}` +
        `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>` +
        contactLine;
      upsertMarker(buyer.id, coords, () => buildPinIcon(mapsApi, '#1d4ed8'), popupHtml, onSelectPin && (() => onSelectPin(buyer.id)));
    });

    stakeholders.forEach((stakeholder) => {
      const coords = stakeholderCoordsById[stakeholder.id];
      if (!coords) return;

      const isYou = stakeholder.id === currentUserId;
      const displayName = isYou ? 'You' : (stakeholder.organizationName || stakeholder.name);
      const contactLine = isYou
        ? ''
        : existingThreadIds.has(stakeholder.id)
          ? `<br/><a href="/messages/direct/${stakeholder.id}">Contact stakeholder</a>`
          : `<br/><small class="muted">No conversation yet</small>`;
      const popupHtml =
        `<strong>${displayName}</strong><br/>` +
        (stakeholder.contactPerson ? `${stakeholder.contactPerson}<br/>` : '') +
        `${stakeholder.municipality}` +
        (stakeholder.contactNumber ? `<br/>${stakeholder.contactNumber}` : '') +
        `<br/>${presenceHtml(stakeholder)}` +
        `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>` +
        contactLine;
      upsertMarker(stakeholder.id, coords, () => buildPinIcon(mapsApi, '#db2777'), popupHtml, onSelectPin && (() => onSelectPin(stakeholder.id)));
    });

    donationFarmers.forEach((farmer) => {
      const coords = donationFarmerCoordsById[farmer.id];
      if (!coords) return;

      const displayName = farmer.farmName || farmer.name;
      const donationList = farmer.donations
        .map((donation) => `${donation.productName} — ${donation.quantity} ${donation.unit}`)
        .join('<br/>');
      // Deliberately NOT gated on existingThreadIds like the general directory pins above —
      // a stakeholder spotting a fresh donation on the map needs to be able to make first
      // contact to arrange pickup; that's the entire point of this pin.
      const popupHtml =
        `<strong>${displayName}</strong><br/>` +
        `${farmer.name}<br/>` +
        `${farmer.municipality}` +
        (farmer.contactNumber ? `<br/>${farmer.contactNumber}` : '') +
        `<br/><small>${PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback}</small>` +
        `<br/><a href="/messages/direct/${farmer.id}">Contact farmer</a>` +
        `<br/><br/><strong>Available donations</strong><br/>${donationList}`;
      upsertMarker(farmer.id, coords, () => buildPinIcon(mapsApi, '#db2777', { alert: true }), popupHtml, onSelectPin && (() => onSelectPin(farmer.id)));
    });

    // Drop markers for accounts no longer present (e.g. an account that goes offline the
    // map no longer serves, or the search filter narrows the list) instead of nuking and
    // rebuilding everything, which is what let a live poll refresh close an open info window.
    Object.keys(markersRef.current).forEach((id) => {
      if (seenIds.has(id)) return;
      markersRef.current[id].marker.setMap(null);
      markersRef.current[id].infoWindow.close();
      delete markersRef.current[id];
    });

    // Background geocoding progressively upgrades pin positions after the initial render
    // — only auto-fit the camera once per distinct set of accounts, so a later address-level
    // upgrade nudging a pin doesn't yank the user's manual pan/zoom back to "fit everything".
    const signature = [...farmers, ...buyers, ...stakeholders, ...donationFarmers].map((person) => person.id).sort().join(',');
    if (signature !== fittedSignatureRef.current) {
      fittedSignatureRef.current = signature;
      if (allPoints.length === 1) {
        map.setCenter(allPoints[0]);
        map.setZoom(12);
      } else if (allPoints.length > 1) {
        const bounds = new mapsApi.LatLngBounds();
        allPoints.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, 40);
      } else {
        map.setCenter(CEBU_CENTER);
        map.setZoom(9);
      }
    }
  }, [
    mapReady,
    farmers,
    buyers,
    stakeholders,
    donationFarmers,
    farmerCoordsById,
    buyerCoordsById,
    stakeholderCoordsById,
    donationFarmerCoordsById,
    onSelectPin,
    farmersWithProducts,
    currentUserId,
    existingThreadIds,
  ]);

  useEffect(() => {
    if (!selectedId || !mapReady) return;
    const map = mapRef.current;
    const entry = markersRef.current[selectedId];
    if (!entry || !map) return;
    map.panTo(entry.marker.getPosition());
    map.setZoom(13);
    if (openInfoWindowRef.current && openInfoWindowRef.current !== entry.infoWindow) {
      openInfoWindowRef.current.close();
    }
    entry.infoWindow.open({ map, anchor: entry.marker });
    openInfoWindowRef.current = entry.infoWindow;
  }, [selectedId, mapReady]);

  return (
    <div ref={wrapperRef} className={`farmer-map-wrapper ${isFullscreen ? 'fullscreen' : ''}`}>
      <button
        type="button"
        className="map-fullscreen-toggle"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Exit full view' : 'View map fully'}
        title={isFullscreen ? 'Exit full view' : 'View map fully'}
      >
        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
      </button>
      <div ref={containerRef} className="farmer-map" />
    </div>
  );
}
