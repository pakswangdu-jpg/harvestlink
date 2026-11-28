import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import { DARK_MAP_STYLE, loadGoogleMaps } from '../../lib/googleMapsLoader';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';
import { useTheme } from '../../contexts/ThemeContext';
import { buildMapPopup, buildPresenceMarkup, buildRoleMapPopup } from './mapPopupMarkup';
import MapUserDetailsDrawer from './MapUserDetailsDrawer';

import { buildViewerIcon, buildViewerPopup } from './userLocationMarker';
import { validateCoordinates, nearbyMapPoints } from '../../utils/geo';
import { buildFarmerMapMarkerIcon } from './farmerMapMarkerIcon';
import { buildBuyerMapMarkerIcon } from './buyerMapMarkerIcon';
import { buildStakeholderMapMarkerIcon } from './stakeholderMapMarkerIcon';
import { donationAnimation, isDonationAlert } from './donationMarker';
import {
  applyMarkerStackLayout,
  bindOverlappingMarkerSelection,
  focusSelectedProfileMarker,
  getRoleMarkerKey,
  syncMarkerPositions,
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
  initialCenter = null,
  selectedId,
  onSelectPin,
  farmersWithProducts = EMPTY_SET,
  currentUserId,
  viewerCoords = null,
  viewerAddress = '',
  nearbyView = false,
  animateDonationAlerts = false,
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
  const [selectedDetail, setSelectedDetail] = useState(null);
  const onSeeDetailsRef = useRef(null);
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
    onSeeDetailsRef.current = (entry) => {
      if (!entry?.profile) return;
      if (document.fullscreenElement && document.fullscreenElement === wrapperRef.current) {
        document.exitFullscreen?.().catch(() => {});
      }
      setSelectedDetail({
        role: entry.role,
        userId: entry.userId,
        profile: entry.profile,
        coords: entry.position,
        precisionLabel: entry.precisionLabel || '',
        isYou: Boolean(entry.isCurrentUser),
      });
    };
  });

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
        center: validateCoordinates(initialCenter?.lat, initialCenter?.lng)
          || validateCoordinates(viewerCoords?.lat, viewerCoords?.lng)
          || { lat: 0, lng: 0 },
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
    const center = validateCoordinates(initialCenter?.lat, initialCenter?.lng)
      || validateCoordinates(viewerCoords?.lat, viewerCoords?.lng);
    if (!mapReady || !mapRef.current || !center || Object.keys(markersRef.current).length) return;
    mapRef.current.setCenter(center);
  }, [initialCenter?.lat, initialCenter?.lng, viewerCoords?.lat, viewerCoords?.lng, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return undefined;
    const zoomListener = map.addListener('zoom_changed', () => {
      applyMarkerStackLayout(Object.values(markersRef.current));
    });
    return () => zoomListener.remove();
  }, [mapReady]);





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

    function upsertMarker(
      role,
      userId,
      coords,
      buildIcon,
      popupHtml,
      onClick,
      title,
      donationAlert = false,
      animateGoogleMarker = donationAlert,
      profile = null,
      precisionLabel = '',
      isCurrentUser = false,
    ) {
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
          existing.layoutAnchor = null;
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
        existing.profile = profile;
        existing.precisionLabel = precisionLabel;
        existing.isCurrentUser = isCurrentUser;
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
        profile, precisionLabel, isCurrentUser,
      };
      entry.markerClickListener = marker.addListener('click', () => {
        showProfileMarkerInfo(map, mapsApi, entry, { current: markersRef.current }, openInfoWindowRef);
        if (entry.onClick) entry.onClick();
      });
      infoWindow.mapMarkerKey = id;
      entry.overlapDomReadyListener = bindOverlappingMarkerSelection(infoWindow, { current: markersRef.current }, mapsApi, onSeeDetailsRef);
      markersRef.current[id] = entry;
    }

    uniqueFarmers.forEach((farmer) => {
      const coords = farmerCoordsById[farmer.id];
      if (!coords) return;
      const donationAlert = isDonationAlert(farmer, coords);

      const isYou = Boolean(currentUserId && String(farmer.id) === String(currentUserId));
      const realDisplayName = farmer.farmName || farmer.name;
      const displayName = isYou ? `${realDisplayName} (You)` : realDisplayName;
      const hasProducts = farmersWithProducts.has(farmer.id);
      const productsLine = hasProducts
        ? `<a href="/marketplace?farmerId=${farmer.id}&farmerName=${encodeURIComponent(realDisplayName)}">View products</a>`
        : '<small class="muted">No products available</small>';
      const precisionLabel = PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback;
      const popupHtml = buildRoleMapPopup({
        profile: farmer,
        role: 'farmer',
        coords,
        precision: precisionLabel,
        isYou,
        markerKey: getRoleMarkerKey('farmer', farmer.id),
        productsHtml: `${donationAlert ? '<strong>Surplus donation available</strong><br/>' : ''}${productsLine}`,
        links: isYou ? [] : [{ href: `/messages/direct/${farmer.id}`, label: 'Contact farmer', icon: 'message' }],
      });
      upsertMarker('farmer', farmer.id, coords, () => buildFarmerMapMarkerIcon(mapsApi, { donationAlert, alert: donationAlert, isYou }), popupHtml, onSelectPin && (() => onSelectPin(farmer.id)), donationAlert ? `${displayName}: surplus donation available` : displayName, donationAlert, donationAlert && animateDonationAlerts && !nearbyView, farmer, precisionLabel, isYou);
    });

    uniqueBuyers.forEach((buyer) => {
      const coords = buyerCoordsById[buyer.id];
      if (!coords) return;

      const isYou = Boolean(currentUserId && String(buyer.id) === String(currentUserId));
      const displayName = isYou ? `${buyer.name} (You)` : buyer.name;
      const precisionLabel = PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback;
      const popupHtml = buildRoleMapPopup({
        profile: buyer,
        role: 'buyer',
        coords,
        precision: precisionLabel,
        isYou,
        markerKey: getRoleMarkerKey('buyer', buyer.id),
        links: isYou ? [] : [{ href: `/messages/direct/${buyer.id}`, label: 'Contact buyer', icon: 'message' }],
      });
      upsertMarker('buyer', buyer.id, coords, () => buildBuyerMapMarkerIcon(mapsApi, { isYou }), popupHtml, onSelectPin && (() => onSelectPin(buyer.id)), displayName, false, false, buyer, precisionLabel, isYou);
    });

    uniqueStakeholders.forEach((stakeholder) => {
      const coords = stakeholderCoordsById[stakeholder.id];
      if (!coords) return;

      const isYou = Boolean(currentUserId && String(stakeholder.id) === String(currentUserId));
      const baseName = stakeholder.organizationName || stakeholder.name;
      const displayName = isYou ? `${baseName} (You)` : baseName;
      const precisionLabel = PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback;
      const popupHtml = buildRoleMapPopup({
        profile: stakeholder,
        role: 'stakeholder',
        coords,
        precision: precisionLabel,
        isYou,
        markerKey: getRoleMarkerKey('stakeholder', stakeholder.id),
        links: isYou ? [] : [{ href: `/messages/direct/${stakeholder.id}`, label: 'Contact stakeholder', icon: 'message' }],
      });
      upsertMarker('stakeholder', stakeholder.id, coords, () => buildStakeholderMapMarkerIcon(mapsApi, { isYou }), popupHtml, onSelectPin && (() => onSelectPin(stakeholder.id)), displayName, false, false, stakeholder, precisionLabel, isYou);
    });

    uniqueDonationFarmers.forEach((farmer) => {
      const coords = donationFarmerCoordsById[farmer.id];
      if (!coords) return;
      const displayName = farmer.farmName || farmer.name;
      const donationList = farmer.donations
        .map((donation) => `${donation.productName} — ${donation.quantity} ${donation.unit}`)
        .join('<br/>');
      const precisionLabel = [PRECISION_LABELS[coords.precision] || PRECISION_LABELS.fallback, farmer.distanceLabel ? `Approx. ${farmer.distanceLabel}` : ''].filter(Boolean).join(' / ');
      const popupHtml = buildMapPopup({
        name: displayName,
        person: farmer.name,
        roleLabel: 'Farmer',
        roleTone: 'farmer',
        verificationLabel: farmer.verificationStatus === 'verified' ? 'Verified' : '',
        municipality: farmer.municipality,
        address: farmer.address,
        barangay: farmer.barangay,
        fullAddress: true,
        coords,
        contactNumber: farmer.contactNumber,
        presence: buildPresenceMarkup(farmer),
        precision: precisionLabel,
        products: `<strong>Available donations</strong><br/>${donationList}`,
        detailsMarkerKey: getRoleMarkerKey('farmer', farmer.id),
        detailsLabel: 'See details',
        links: [...(farmer.donationDetailsHref === '/stakeholder-donations' ? [{ href: '/stakeholder-donations', label: 'View donation' }] : []), { href: `/messages/direct/${farmer.id}`, label: 'Contact farmer' }],
      });
      upsertMarker('farmer', farmer.id, coords, () => buildFarmerMapMarkerIcon(mapsApi, { donationAlert: true, alert: true }), popupHtml, onSelectPin && (() => onSelectPin(farmer.id)), `${displayName}: surplus donation available`, true, animateDonationAlerts && !nearbyView, farmer, precisionLabel, false);
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
      entry?.connectorLine?.setMap?.(null);
      entry?.marker?.setMap?.(null);
      entry?.infoWindow?.close?.();
      delete markersRef.current[id];
    });

    syncMarkerPositions(Object.values(markersRef.current));

    const openEntry = Object.values(markersRef.current)
      .find((entry) => entry.infoWindow === openInfoWindowRef.current);
    if (openEntry) {
      showProfileMarkerInfo(map, mapsApi, openEntry, { current: markersRef.current }, openInfoWindowRef);
    }

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
    animateDonationAlerts,
  ]);

  useEffect(() => () => {
    Object.values(markersRef.current).forEach((entry) => {
      entry?.markerClickListener?.remove?.();
      entry?.overlapDomReadyListener?.remove?.();
      entry?.connectorLine?.setMap?.(null);
      entry?.marker?.setMap?.(null);
      entry?.infoWindow?.close?.();
    });
    markersRef.current = {};
  }, []);

  useEffect(() => {
    if (!selectedId || !mapReady) return;
    const map = mapRef.current;
    const mapsApi = mapsApiRef.current;
    const entry = Object.values(markersRef.current).find((markerEntry) => (
      markerEntry.userId === String(selectedId) && markerEntry.role !== 'viewer'
    )) || markersRef.current[getRoleMarkerKey('viewer', selectedId)];
    if (!entry || !map || !mapsApi) return;
    const currentAccountEntry = Object.values(markersRef.current).find((markerEntry) => (
      markerEntry.userId === String(currentUserId) && markerEntry.role !== 'viewer'
    ));
    const currentAccountPosition = validateCoordinates(viewerCoords?.lat, viewerCoords?.lng)
      || currentAccountEntry?.position;
    focusSelectedProfileMarker(
      map,
      mapsApi,
      entry.position,
      currentAccountPosition,
      String(selectedId) === String(currentUserId),
    );
    showProfileMarkerInfo(map, mapsApi, entry, { current: markersRef.current }, openInfoWindowRef);
  }, [selectedId, mapReady, currentUserId, viewerCoords?.lat, viewerCoords?.lng]);

  const activeDetail = useMemo(() => {
    if (!selectedDetail) return null;
    const pool = selectedDetail.role === 'farmer'
      ? [...uniqueDonationFarmers, ...uniqueFarmers]
      : selectedDetail.role === 'buyer'
        ? uniqueBuyers
        : uniqueStakeholders;
    const liveProfile = pool.find((item) => String(item.id) === String(selectedDetail.userId));
    return {
      ...selectedDetail,
      profile: liveProfile || selectedDetail.profile,
    };
  }, [selectedDetail, uniqueDonationFarmers, uniqueFarmers, uniqueBuyers, uniqueStakeholders]);

  return (
    <>
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
      <MapUserDetailsDrawer
        detail={activeDetail}
        viewerCoords={viewerCoords}
        onClose={() => setSelectedDetail(null)}
      />
    </>
  );
}
