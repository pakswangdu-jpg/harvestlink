import { useEffect, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { DARK_MAP_STYLE, loadGoogleMaps } from '../../lib/googleMapsLoader';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';
import { useTheme } from '../../contexts/ThemeContext';
import { MAP_COLORS } from '../../lib/mapMarkerColors';
import { buildMapPopup, buildPresenceMarkup } from './mapPopupMarkup';

import { buildViewerIcon, buildViewerPopup } from './userLocationMarker';
import { validateCoordinates, nearbyMapPoints } from '../../utils/geo';

const PRECISION_LABELS = {
  registered: 'Registered location',
  address: 'Exact registered address',
  municipality: 'Approximate — municipality center',
  fallback: 'Approximate — municipality area',
};







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
  viewerCoords = null,
  viewerAddress = '',
  nearbyView = false,
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
  const { effectiveTheme } = useTheme();
  const farmerCoordsById = useMapCoordinates(farmers, { registeredOnly: nearbyView });
  const buyerCoordsById = useMapCoordinates(buyers, { registeredOnly: nearbyView });
  const stakeholderCoordsById = useMapCoordinates(stakeholders, { registeredOnly: nearbyView });
  const donationFarmerCoordsById = useMapCoordinates(donationFarmers, { registeredOnly: nearbyView });

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
        center: validateCoordinates(viewerCoords?.lat, viewerCoords?.lng) || { lat: 0, lng: 0 },
        zoom: 9,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        clickableIcons: false,
        styles: effectiveTheme === 'dark' ? DARK_MAP_STYLE : [],
      });
      mapRef.current = map;
      mapsApiRef.current = mapsApi;
      setMapReady(true);
    });

    return () => {
      cancelled = true;
    };



    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);




  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.setOptions({ styles: effectiveTheme === 'dark' ? DARK_MAP_STYLE : [] });
  }, [effectiveTheme, mapReady]);





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
    let allPoints = [];

    function openInfoWindow(marker, infoWindow) {
      if (openInfoWindowRef.current && openInfoWindowRef.current !== infoWindow) {
        openInfoWindowRef.current.close();
      }
      infoWindow.open({ map, anchor: marker });
      openInfoWindowRef.current = infoWindow;
    }







    function upsertMarker(id, coords, buildIcon, popupHtml, onClick, title) {
      seenIds.add(id);
      allPoints.push(coords);
      const existing = markersRef.current[id];
      if (existing) {
        const positionChanged =
          existing.position.lat !== coords.lat || existing.position.lng !== coords.lng;
        if (positionChanged) {
          existing.marker.setPosition(coords);
          existing.position = coords;
        }
        if (existing.popupHtml !== popupHtml) {
          existing.infoWindow.setContent(popupHtml);
          existing.popupHtml = popupHtml;
        }
        return;
      }
      const marker = new mapsApi.Marker({ position: coords, map, icon: buildIcon(), title, zIndex: title === 'Your location' ? 900 : undefined });
      const infoWindow = new mapsApi.InfoWindow({ content: popupHtml });
      marker.addListener('click', () => {
        openInfoWindow(marker, infoWindow);
        if (onClick) onClick();
      });
      markersRef.current[id] = { marker, infoWindow, position: coords, popupHtml };
    }

    farmers.forEach((farmer) => {
      if (nearbyView && currentUserId && farmer.id === currentUserId) return;
      const coords = farmerCoordsById[farmer.id];
      if (!coords) return;

      const isYou = farmer.id === currentUserId;
      const realDisplayName = farmer.farmName || farmer.name;
      const displayName = isYou ? 'You' : realDisplayName;
      const hasProducts = farmersWithProducts.has(farmer.id);
      const productsLine = hasProducts
        ? `<br/><a href="/marketplace?farmerId=${farmer.id}&farmerName=${encodeURIComponent(realDisplayName)}">View products</a>`
        : `<br/><small class="muted">No products available</small>`;



      const popupHtml = buildMapPopup({
        name: displayName,
        person: farmer.name,
        municipality: farmer.municipality,
        address: farmer.address,
        barangay: farmer.barangay,
        coords,
        contactNumber: farmer.contactNumber,
        presence: buildPresenceMarkup(farmer),
        precision: PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback,
        products: productsLine.replace('<br/>', ''),
        links: isYou ? [] : [{ href: `/messages/direct/${farmer.id}`, label: 'Contact farmer' }],
      });
      upsertMarker(farmer.id, coords, () => buildPinIcon(mapsApi, MAP_COLORS.farmer), popupHtml, onSelectPin && (() => onSelectPin(farmer.id)));
    });

    buyers.forEach((buyer) => {
      if (nearbyView && currentUserId && buyer.id === currentUserId) return;
      const coords = buyerCoordsById[buyer.id];
      if (!coords) return;

      const isYou = buyer.id === currentUserId;
      const popupHtml = buildMapPopup({
        name: isYou ? 'You' : buyer.name,
        municipality: buyer.municipality,
        address: buyer.address,
        barangay: buyer.barangay,
        coords,
        contactNumber: buyer.contactNumber,
        presence: buildPresenceMarkup(buyer),
        precision: PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback,
        links: isYou ? [] : [{ href: `/messages/direct/${buyer.id}`, label: 'Contact buyer' }],
      });
      upsertMarker(buyer.id, coords, () => buildPinIcon(mapsApi, MAP_COLORS.buyer), popupHtml, onSelectPin && (() => onSelectPin(buyer.id)));
    });

    stakeholders.forEach((stakeholder) => {
      if (nearbyView && currentUserId && stakeholder.id === currentUserId) return;
      const coords = stakeholderCoordsById[stakeholder.id];
      if (!coords) return;

      const isYou = stakeholder.id === currentUserId;
      const displayName = isYou ? 'You' : (stakeholder.organizationName || stakeholder.name);
      const popupHtml = buildMapPopup({
        name: displayName,
        person: stakeholder.contactPerson,
        municipality: stakeholder.municipality,
        address: stakeholder.address,
        barangay: stakeholder.barangay,
        coords,
        contactNumber: stakeholder.contactNumber,
        presence: buildPresenceMarkup(stakeholder),
        precision: PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback,
        links: isYou ? [] : [{ href: `/messages/direct/${stakeholder.id}`, label: 'Contact stakeholder' }],
      });
      upsertMarker(stakeholder.id, coords, () => buildPinIcon(mapsApi, MAP_COLORS.stakeholder), popupHtml, onSelectPin && (() => onSelectPin(stakeholder.id)));
    });

    donationFarmers.forEach((farmer) => {
      if (nearbyView && currentUserId && farmer.id === currentUserId) return;
      const coords = donationFarmerCoordsById[farmer.id];
      if (!coords) return;

      const displayName = farmer.farmName || farmer.name;
      const donationList = farmer.donations
        .map((donation) => `${donation.productName} — ${donation.quantity} ${donation.unit}`)
        .join('<br/>');
      const popupHtml = buildMapPopup({
        name: displayName,
        person: farmer.name,
        municipality: farmer.municipality,
        address: farmer.address,
        barangay: farmer.barangay,
        coords,
        contactNumber: farmer.contactNumber,
        presence: buildPresenceMarkup(farmer),
        precision: PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback,
        products: `<strong>Available donations</strong><br/>${donationList}`,
        links: [{ href: `/messages/direct/${farmer.id}`, label: 'Contact farmer' }],
      });
      upsertMarker(farmer.id, coords, () => buildPinIcon(mapsApi, MAP_COLORS.stakeholder, { alert: true }), popupHtml, onSelectPin && (() => onSelectPin(farmer.id)));
    });




    const viewerPoint = validateCoordinates(viewerCoords?.lat, viewerCoords?.lng);
    if (viewerPoint && currentUserId) {
      upsertMarker(`viewer:${currentUserId}`, viewerPoint, () => buildViewerIcon(mapsApi), buildViewerPopup(viewerAddress), undefined, 'Your location');
      allPoints = nearbyMapPoints(viewerPoint, farmers.filter((person) => person.id !== currentUserId).map((person) => farmerCoordsById[person.id]).filter(Boolean));
    }

    Object.keys(markersRef.current).forEach((id) => {
      if (seenIds.has(id)) return;
      markersRef.current[id].marker.setMap(null);
      markersRef.current[id].infoWindow.close();
      delete markersRef.current[id];
    });




    const signature = nearbyView
      ? allPoints.map((point) => `${point.lat},${point.lng}`).sort().join(';')
      : [...farmers, ...buyers, ...stakeholders, ...donationFarmers].map((person) => person.id).sort().join(',');
    if (signature !== fittedSignatureRef.current) {
      fittedSignatureRef.current = signature;
      if (allPoints.length === 1) {
        map.setCenter(allPoints[0]);
        map.setZoom(12);
      } else if (allPoints.length > 1) {
        const bounds = new mapsApi.LatLngBounds();
        allPoints.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, 40);
        if (viewerPoint) mapsApi.event.addListenerOnce(map, 'idle', () => {
          if (map.getZoom() > 16) map.setZoom(16);
        });
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
    viewerCoords?.lat,
    viewerCoords?.lng,
    viewerAddress,
    nearbyView,
  ]);

  useEffect(() => {
    if (!selectedId || !mapReady) return;
    const map = mapRef.current;
    const entry = markersRef.current[`viewer:${selectedId}`] || markersRef.current[selectedId];
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
        aria-pressed={isFullscreen}
      >
        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
      </button>
      <div ref={containerRef} className="farmer-map" />
    </div>
  );
}
