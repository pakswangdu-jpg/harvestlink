import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { DARK_MAP_STYLE, loadGoogleMaps } from '../../lib/googleMapsLoader';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';
import { useTheme } from '../../contexts/ThemeContext';
import { buildMapPopup, buildPresenceMarkup } from './mapPopupMarkup';

import { buildViewerIcon, buildViewerPopup } from './userLocationMarker';
import { validateCoordinates, nearbyMapPoints } from '../../utils/geo';
import { buildFarmerMapMarkerIcon } from './farmerMapMarkerIcon';
import { buildBuyerMapMarkerIcon } from './buyerMapMarkerIcon';
import { buildStakeholderMapMarkerIcon } from './stakeholderMapMarkerIcon';
import { donationAnimation, isDonationAlert } from './donationMarker';
import {
  bindOverlappingMarkerSelection,
  applyMarkerStackLayout,
  getRoleMarkerKey,
  showProfileMarkerInfo,
  uniqueProfilesById,
} from './mapMarkerUtils';

const PRECISION_LABELS = {
  registered: 'Registered location',
  address: 'Exact registered address',
  municipality: 'Approximate — municipality center',
  fallback: 'Approximate — municipality area',
};





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
  const uniqueFarmers = useMemo(() => uniqueProfilesById(farmers), [farmers]);
  const uniqueBuyers = useMemo(() => uniqueProfilesById(buyers), [buyers]);
  const uniqueStakeholders = useMemo(() => uniqueProfilesById(stakeholders), [stakeholders]);
  const uniqueDonationFarmers = useMemo(() => uniqueProfilesById(donationFarmers), [donationFarmers]);
  const farmerCoordsById = useMapCoordinates(uniqueFarmers, { registeredOnly: nearbyView });
  const buyerCoordsById = useMapCoordinates(uniqueBuyers, { registeredOnly: nearbyView });
  const stakeholderCoordsById = useMapCoordinates(uniqueStakeholders, { registeredOnly: nearbyView });
  const donationFarmerCoordsById = useMapCoordinates(uniqueDonationFarmers, { registeredOnly: true });

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
    }).catch(() => {});

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

    function upsertMarker(role, userId, coords, buildIcon, popupHtml, onClick, title, donationAlert = false, animateGoogleMarker = donationAlert) {
      const id = getRoleMarkerKey(role, userId);
      seenIds.add(id);
      allPoints.push(coords);
      const icon = buildIcon();
      const zIndex = title === 'Your location' ? 1000 : donationAlert ? 750 : 700;
      const existing = markersRef.current[id];
      if (existing) {
        const iconChanged =
          existing.icon?.url !== icon?.url ||
          existing.icon?.scaledSize?.width !== icon?.scaledSize?.width ||
          existing.icon?.scaledSize?.height !== icon?.scaledSize?.height ||
          existing.icon?.anchor?.x !== icon?.anchor?.x ||
          existing.icon?.anchor?.y !== icon?.anchor?.y;
        if (iconChanged) {
          existing.marker.setIcon(icon || null);
          existing.icon = icon;
        }
        if (existing.title !== title) {
          existing.marker.setTitle(title || '');
          existing.title = title;
        }
        if (existing.zIndex !== zIndex) {
          existing.marker.setZIndex(zIndex);
          existing.zIndex = zIndex;
        }
        if (existing.donationAlert !== donationAlert) {
          existing.donationAlert = donationAlert;
        }
        if (existing.animateGoogleMarker !== animateGoogleMarker) {
          existing.marker.setAnimation(donationAnimation(mapsApi, animateGoogleMarker));
          existing.animateGoogleMarker = animateGoogleMarker;
        }
        const positionChanged =
          existing.position.lat !== coords.lat || existing.position.lng !== coords.lng;
        if (positionChanged) {
          existing.marker.setPosition(coords);
          existing.position = coords;
        }
        existing.infoWindow.setContent(popupHtml);
        existing.popupHtml = popupHtml;
        existing.onClick = onClick;
        existing.role = role;
        existing.userId = String(userId);
        existing.position = coords;
        return;
      }
      const marker = new mapsApi.Marker({
        position: coords,
        map,
        ...(icon ? { icon } : {}),
        title,
        animation: donationAnimation(mapsApi, animateGoogleMarker),
        zIndex,
      });
      const infoWindow = new mapsApi.InfoWindow({ content: popupHtml });
      const entry = {
        key: id, role, userId: String(userId), title, marker, infoWindow, position: coords,
        popupHtml, donationAlert, animateGoogleMarker, icon, zIndex, onClick,
      };
      entry.markerClickListener = marker.addListener('click', () => {
        showProfileMarkerInfo(map, mapsApi, entry, { current: markersRef.current }, openInfoWindowRef);
        if (entry.onClick) entry.onClick();
      });
      infoWindow.mapMarkerKey = id;
      entry.overlapDomReadyListener = bindOverlappingMarkerSelection(infoWindow, { current: markersRef.current }, mapsApi);
      markersRef.current[id] = entry;
    }

    uniqueFarmers.forEach((farmer) => {
      const coords = farmerCoordsById[farmer.id];
      if (!coords) return;
      const donationAlert = isDonationAlert(farmer, coords);
      if (nearbyView && currentUserId && farmer.id === currentUserId && !donationAlert) return;

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
        products: `${donationAlert ? '<strong>Surplus donation available</strong><br/>' : ''}${productsLine.replace('<br/>', '')}`,
        links: isYou ? [] : [{ href: `/messages/direct/${farmer.id}`, label: 'Contact farmer' }],
      });
      upsertMarker('farmer', farmer.id, coords, () => buildFarmerMapMarkerIcon(mapsApi), popupHtml, onSelectPin && (() => onSelectPin(farmer.id)), donationAlert ? `${realDisplayName}: surplus donation available` : realDisplayName, donationAlert, donationAlert && !nearbyView);
    });

    uniqueBuyers.forEach((buyer) => {
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
      upsertMarker('buyer', buyer.id, coords, () => buildBuyerMapMarkerIcon(mapsApi), popupHtml, onSelectPin && (() => onSelectPin(buyer.id)), buyer.name);
    });

    uniqueStakeholders.forEach((stakeholder) => {
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
      upsertMarker('stakeholder', stakeholder.id, coords, () => buildStakeholderMapMarkerIcon(mapsApi), popupHtml, onSelectPin && (() => onSelectPin(stakeholder.id)), displayName);
    });

    uniqueDonationFarmers.forEach((farmer) => {
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
        precision: [PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback, farmer.distanceLabel ? `Approx. ${farmer.distanceLabel}` : ''].filter(Boolean).join(' / '),
        products: `<strong>Available donations</strong><br/>${donationList}`,
        links: [...(farmer.donationDetailsHref === '/stakeholder-donations' ? [{ href: '/stakeholder-donations', label: 'View donation' }] : []), { href: `/messages/direct/${farmer.id}`, label: 'Contact farmer' }],
      });
      upsertMarker('farmer', farmer.id, coords, () => buildFarmerMapMarkerIcon(mapsApi), popupHtml, onSelectPin && (() => onSelectPin(farmer.id)), `${displayName}: surplus donation available`, true, !nearbyView);
    });




    const viewerPoint = validateCoordinates(viewerCoords?.lat, viewerCoords?.lng);
    if (viewerPoint && currentUserId) {
      upsertMarker('viewer', currentUserId, viewerPoint, () => buildViewerIcon(mapsApi), buildViewerPopup(viewerAddress), undefined, 'Your location');
      allPoints = nearbyMapPoints(viewerPoint, uniqueFarmers.filter((person) => person.id !== currentUserId).map((person) => farmerCoordsById[person.id]).filter(Boolean));
    }

    Object.keys(markersRef.current).forEach((id) => {
      if (seenIds.has(id)) return;
      const entry = markersRef.current[id];
      entry?.markerClickListener?.remove?.();
      entry?.overlapDomReadyListener?.remove?.();
      entry?.marker?.setMap?.(null);
      entry?.infoWindow?.close?.();
      delete markersRef.current[id];
    });

    const openEntry = Object.values(markersRef.current)
      .find((entry) => entry.infoWindow === openInfoWindowRef.current);
    if (openEntry) {
      showProfileMarkerInfo(map, mapsApi, openEntry, { current: markersRef.current }, openInfoWindowRef);
    }

    const syncMarkerStacks = () => applyMarkerStackLayout(
      Object.values(markersRef.current),
      map.getZoom() || 0,
      mapsApi,
    );
    syncMarkerStacks();
    const zoomListener = map.addListener('zoom_changed', syncMarkerStacks);


    const signature = nearbyView
      ? allPoints.map((point) => `${point.lat},${point.lng}`).sort().join(';')
      : Object.keys(markersRef.current).sort().join(',');
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
    return () => zoomListener?.remove?.();
  }, [
    mapReady,
    uniqueFarmers,
    uniqueBuyers,
    uniqueStakeholders,
    uniqueDonationFarmers,
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

  useEffect(() => () => {
    Object.values(markersRef.current).forEach((entry) => {
      entry?.markerClickListener?.remove?.();
      entry?.overlapDomReadyListener?.remove?.();
      entry?.marker?.setMap?.(null);
      entry?.infoWindow?.close?.();
    });
    markersRef.current = {};
  }, []);

  useEffect(() => {
    if (!selectedId || !mapReady) return;
    const map = mapRef.current;
    const entry = markersRef.current[getRoleMarkerKey('viewer', selectedId)]
      || Object.values(markersRef.current).find((markerEntry) => markerEntry.userId === String(selectedId));
    if (!entry || !map) return;
    map.panTo(entry.marker.getPosition());
    map.setZoom(13);
    showProfileMarkerInfo(map, mapsApiRef.current, entry, { current: markersRef.current }, openInfoWindowRef);
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
