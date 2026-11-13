import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  MapPin,
  Navigation,
  ShieldCheck,
} from 'lucide-react';
import Button from '../common/Button';
import StatusBadge from '../common/StatusBadge';
import DeliveryTrackingOverlay from './DeliveryTrackingOverlay';
import TrackingRouteSummary from './TrackingRouteSummary';
import LiveDeliveryMap from './LiveDeliveryMap';
import {
  confirmDonationHandover,
  getDonationById,
  getDonationTrackingProfiles,
  notifyFarmerOfDonationArrival,
} from '../../services/donationService';
import { getSocket } from '../../lib/socketClient';
import {
  APPROACHING_FARM_RADIUS_KM,
  canFarmerConfirmDonationHandover,
  DONATION_WORKFLOW_STEPS,
  getDonationWorkflowLabel,
  getDonationWorkflowStepIndex,
  isDonationArrivalVerified,
  resolveDonationPickupStatus,
} from '../../utils/donationWorkflow';
import { formatDate, formatDurationMinutes, formatQuantity } from '../../utils/formatters';
import { getRegisteredCoordinates } from '../../utils/geo';
import './DonationPickupTrackingModal.css';

const ARRIVAL_POKE_COOLDOWN_MS = 60_000;

export function DonationWorkflowStepper({ record }) {
  const activeIndex = getDonationWorkflowStepIndex(record);
  const label = getDonationWorkflowLabel(record);
  const resolved = resolveDonationPickupStatus(record);

  return (
    <section className="donation-workflow-card" aria-label="Donation pickup status workflow">
      <div className="donation-workflow-header">
        <h3>Donation Pickup Progress</h3>
        <StatusBadge status={resolved} label={label} />
      </div>
      <ol className="donation-workflow-steps">
        {DONATION_WORKFLOW_STEPS.map((step, index) => {
          const isCompleted = activeIndex > index || resolved === 'confirmed';
          const isActive = activeIndex === index && resolved !== 'confirmed';
          return (
            <li
              key={step.key}
              className={`donation-workflow-step${isCompleted ? ' is-completed' : ''}${isActive ? ' is-active' : ''}`}
            >
              <span className="donation-workflow-step-num" aria-hidden="true">
                {isCompleted ? '✓' : step.stepNumber}
              </span>
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function DonationHandoverConfirmModal({
  open,
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}) {
  if (!open) return null;
  return (
    <div
      className="donation-handover-confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="donation-handover-confirm-title"
    >
      <div className="donation-handover-confirm-dialog">
        <h3 id="donation-handover-confirm-title">Confirm Donation Handover?</h3>
        <p>
          Please confirm that you have successfully handed over the donated products to the Stakeholder.
        </p>
        {error ? <p className="donation-handover-confirm-error" role="alert">{error}</p> : null}
        <div className="donation-handover-confirm-actions">
          <Button variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} aria-busy={busy} onClick={onConfirm}>
            {busy ? 'Confirming…' : 'Confirm Donation'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function DonationPickupTrackingModal({
  donation,
  claim = null,
  viewerRole = 'stakeholder',
  permissionState = 'prompt',
  permissionError = '',
  trackingLoadError = '',
  lastUpdatedAt = null,
  onRequestPermission,
  onConfirmHandover,
  onClose,
  onStatusUpdated,
}) {
  const [liveDonation, setLiveDonation] = useState(donation);
  const [lastPropDonation, setLastPropDonation] = useState(donation);
  if (lastPropDonation !== donation) {
    setLastPropDonation(donation);
    setLiveDonation(donation);
  }
  const [liveClaim, setLiveClaim] = useState(claim);
  const [lastPropClaim, setLastPropClaim] = useState(claim);
  if (lastPropClaim !== claim) {
    setLastPropClaim(claim);
    setLiveClaim(claim);
  }
  const [trackingProfiles, setTrackingProfiles] = useState(null);
  const [routeSnapshot, setRouteSnapshot] = useState(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [notifyingFarmer, setNotifyingFarmer] = useState(false);
  const [cooldownNow, setCooldownNow] = useState(() => Date.now());
  const [actionError, setActionError] = useState('');

  const activeRecord = useMemo(
    () => (liveClaim ? { ...liveDonation, ...liveClaim, id: liveClaim.id } : liveDonation),
    [liveDonation, liveClaim],
  );
  const lastArrivalPokeAt = activeRecord?.arrivalNotifiedAt;

  useEffect(() => {
    if (!lastArrivalPokeAt) return undefined;
    const cooldownEndsAt = new Date(lastArrivalPokeAt).getTime() + ARRIVAL_POKE_COOLDOWN_MS;
    const interval = setInterval(() => {
      const now = Date.now();
      setCooldownNow(now);
      if (now >= cooldownEndsAt) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [lastArrivalPokeAt]);

  const donationId = liveDonation?.id || donation?.id;
  const claimId = liveClaim?.id || claim?.id || null;
  const targetId = claimId || donationId;

  const refreshDonationRecord = useCallback(async () => {
    if (!donationId) return;
    try {
      const latest = await getDonationById(donationId);
      if (!latest) return;
      setLiveDonation(latest);
      if (claimId) {
        const matchedClaim =
          latest.myClaim?.id === claimId
            ? latest.myClaim
            : (latest.claims || []).find((item) => item.id === claimId) || null;
        if (matchedClaim) setLiveClaim(matchedClaim);
      } else if (latest.myClaim) {
        setLiveClaim(latest.myClaim);
      }
      onStatusUpdated?.(latest);
    } catch {
      // Keep last known state on transient failure.
    }
  }, [donationId, claimId, onStatusUpdated]);

  useEffect(() => {
    if (!donationId) return undefined;
    let cancelled = false;
    getDonationTrackingProfiles(donationId, claimId)
      .then((profiles) => {
        if (cancelled) return;
        setTrackingProfiles(profiles);
        if (profiles?.donation) setLiveDonation((prev) => ({ ...prev, ...profiles.donation }));
        if (profiles?.claim) setLiveClaim((prev) => ({ ...prev, ...profiles.claim }));
      })
      .catch(() => {
        if (!cancelled) setTrackingProfiles(null);
      });

    const pollInterval = setInterval(refreshDonationRecord, 4000);
    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, [donationId, claimId, refreshDonationRecord]);

  useEffect(() => {
    if (!targetId) return undefined;
    let socket = null;
    try {
      socket = getSocket();
    } catch {
      return undefined;
    }
    const handleStatusUpdate = (payload) => {
      if (!payload) return;
      if (payload.id === targetId || payload.orderId === targetId || payload.donationId === donationId) {
        if (claimId && (payload.id === claimId || payload.claimId === claimId)) {
          setLiveClaim((prev) => ({ ...prev, ...payload }));
        } else {
          setLiveDonation((prev) => ({ ...prev, ...payload }));
        }
        onStatusUpdated?.(payload);
      }
    };
    const handleArrival = (payload) => {
      handleStatusUpdate({
        ...payload,
        pickupStatus: 'awaiting_confirmation',
        arrivedAt: payload?.arrivedAt || new Date().toISOString(),
      });
    };

    socket.on('donation-status-update', handleStatusUpdate);
    socket.on('donation-arrival', handleArrival);
    return () => {
      socket.off('donation-status-update', handleStatusUpdate);
      socket.off('donation-arrival', handleArrival);
    };
  }, [targetId, donationId, claimId, onStatusUpdated]);

  if (!activeRecord) return null;

  const resolvedStatus = resolveDonationPickupStatus(activeRecord);
  const arrivalVerified = isDonationArrivalVerified(activeRecord);
  const canConfirm = viewerRole === 'farmer' && canFarmerConfirmDonationHandover(activeRecord);
  const isConfirmed = resolvedStatus === 'confirmed' || activeRecord.status === 'completed';
  const hasRecentGps = Boolean(lastUpdatedAt);

  const rawFarmerProfile = trackingProfiles?.farmer || {
    id: liveDonation?.farmerId,
    name: liveDonation?.farmerName,
    farm_name: liveDonation?.farmerName,
    address: liveDonation?.location,
    municipality: liveDonation?.location,
  };
  const farmerCoordinates = getRegisteredCoordinates(rawFarmerProfile);
  const farmerProfile = {
    ...rawFarmerProfile,
    latitude: farmerCoordinates?.lat ?? null,
    longitude: farmerCoordinates?.lng ?? null,
  };
  const rawStakeholderProfile = trackingProfiles?.stakeholder || trackingProfiles?.buyer || {
    id: liveClaim?.stakeholderId || liveDonation?.requestedById || 'stakeholder',
    name: liveClaim?.stakeholderName || liveDonation?.requestedByName || 'Stakeholder',
    address: liveDonation?.location,
    municipality: liveDonation?.location,
  };
  const stakeholderCoordinates = getRegisteredCoordinates(rawStakeholderProfile);
  const stakeholderProfile = {
    ...rawStakeholderProfile,
    latitude: stakeholderCoordinates?.lat ?? null,
    longitude: stakeholderCoordinates?.lng ?? null,
  };

  const virtualOrder = {
    id: targetId,
    productId: liveDonation?.productId,
    productName: liveDonation?.productName,
    farmerId: liveDonation?.farmerId || farmerProfile?.id || 'farmer',
    farmerName: farmerProfile?.farm_name || liveDonation?.farmerName || 'Farm',
    farmerFarmName: farmerProfile?.farm_name || liveDonation?.farmerName || 'Farm',
    buyerId: stakeholderProfile?.id || liveClaim?.stakeholderId || liveDonation?.requestedById || 'stakeholder',
    buyerName: stakeholderProfile?.name || liveClaim?.stakeholderName || liveDonation?.requestedByName || 'Stakeholder',
    originMunicipality: farmerProfile?.municipality || liveDonation?.location || 'Cebu City',
    deliveryMunicipality: stakeholderProfile?.municipality || liveDonation?.location || 'Cebu City',
    deliveryMethod: 'buyer_pickup',
    status: isConfirmed ? 'completed' : 'confirmed',
    deliveryStatus: isConfirmed ? 'picked_up' : 'ready_for_pickup',
    currentLat: activeRecord.currentLat ?? null,
    currentLng: activeRecord.currentLng ?? null,
    currentAccuracy: activeRecord.currentAccuracy ?? null,
    currentHeading: activeRecord.currentHeading ?? null,
    currentSpeed: activeRecord.currentSpeed ?? null,
    locationUpdatedAt: activeRecord.locationUpdatedAt ?? null,
    transitStartedAt: activeRecord.transitStartedAt ?? activeRecord.updatedAt ?? activeRecord.createdAt,
    updatedAt: activeRecord.confirmedAt || activeRecord.updatedAt,
  };

  const remainingKm = routeSnapshot?.remainingKm;
  const isApproaching =
    !isConfirmed &&
    !arrivalVerified &&
    typeof remainingKm === 'number' &&
    Number.isFinite(remainingKm) &&
    remainingKm <= APPROACHING_FARM_RADIUS_KM;

  const quantityLabel = `${formatQuantity(liveClaim?.quantity ?? liveDonation?.quantity)} ${liveDonation?.unit || ''}`.trim();
  const farmDestinationName = farmerProfile?.farm_name || liveDonation?.farmerName || 'Registered Farm';
  const farmDestinationAddress =
    [farmerProfile?.address, farmerProfile?.municipality]
      .filter(Boolean)
      .filter((v, idx, arr) => arr.indexOf(v) === idx)
      .join(', ') || liveDonation?.location || 'Registered farm location';
  const routeDistanceLabel = Number.isFinite(routeSnapshot?.remainingKm)
    ? `${routeSnapshot.remainingKm.toFixed(1)} km`
    : '—';
  const routeDurationLabel = Number.isFinite(routeSnapshot?.etaMinutes)
    ? formatDurationMinutes(routeSnapshot.etaMinutes)
    : '—';
  const farmerHasBeenNotified = Boolean(activeRecord.arrivalNotifiedAt);
  const pokeCooldownSeconds = farmerHasBeenNotified
    ? Math.max(
        0,
        Math.ceil(
          (new Date(activeRecord.arrivalNotifiedAt).getTime() + ARRIVAL_POKE_COOLDOWN_MS - cooldownNow) /
            1000,
        ),
      )
    : 0;
  const pokeCooldownLabel = `${Math.floor(pokeCooldownSeconds / 60)}:${String(
    pokeCooldownSeconds % 60,
  ).padStart(2, '0')}`;
  const farmerReportedArrival = Boolean(activeRecord.arrivalNotifiedAt);

  const handleConfirmSubmit = async () => {
    setConfirming(true);
    setActionError('');
    try {
      const updated = onConfirmHandover
        ? await onConfirmHandover(donationId, claimId)
        : await confirmDonationHandover(donationId, claimId);
      setConfirmDialogOpen(false);
      if (claimId) {
        setLiveClaim((prev) => ({
          ...prev,
          ...(updated || {}),
          status: 'completed',
          pickupStatus: 'confirmed',
        }));
      } else {
        setLiveDonation((prev) => ({
          ...prev,
          ...(updated || {}),
          status: 'completed',
          pickupStatus: 'confirmed',
        }));
      }
      onStatusUpdated?.(updated);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('harvestlink:donation-updated'));
      }
    } catch (err) {
      setActionError(err?.message || 'Unable to confirm donation handover.');
      setConfirmDialogOpen(false);
    } finally {
      setConfirming(false);
    }
  };

  const handleNotifyFarmer = async () => {
    if (notifyingFarmer || pokeCooldownSeconds > 0) return;
    setNotifyingFarmer(true);
    setActionError('');
    try {
      const result = await notifyFarmerOfDonationArrival(donationId, claimId);
      const arrivalNotifiedAt = result?.arrivalNotifiedAt || new Date().toISOString();
      if (claimId) {
        setLiveClaim((prev) => ({ ...prev, arrivalNotifiedAt }));
      } else {
        setLiveDonation((prev) => ({ ...prev, arrivalNotifiedAt }));
      }
      onStatusUpdated?.({ id: targetId, arrivalNotifiedAt });
    } catch (err) {
      setActionError(err?.message || 'Unable to notify the farmer. Please try again.');
    } finally {
      setNotifyingFarmer(false);
    }
  };

  return (
    <DeliveryTrackingOverlay
      open
      className="donation-pickup-tracking"
      label="DONATION PICKUP TRACKING"
      title={liveDonation?.productName || 'Donated Produce'}
      subtitle={`${quantityLabel} • Pickup at ${farmDestinationName}`}
      onClose={onClose}
    >
      <div className="donation-tracking-modal-stack">
        {actionError ? (
          <div className="alert-error" role="alert">
            {actionError}
          </div>
        ) : null}

        {viewerRole === 'stakeholder' && !isConfirmed && (
          permissionState !== 'granted' || !hasRecentGps || permissionError || trackingLoadError
        ) ? (
          <div className="donation-tracking-banner is-permission" role="region" aria-label="GPS location permission">
            <div className="donation-tracking-banner-main">
              <AlertCircle size={20} />
              <div>
                <strong>
                  {trackingLoadError
                    ? 'Pickup Tracking Needs Attention'
                    : permissionState === 'denied' || permissionError
                    ? 'GPS Location Needs Attention'
                    : permissionState === 'granted'
                      ? 'Waiting for GPS Location'
                      : 'Share Your Live GPS Location to Start Pickup'}
                </strong>
                <p>
                  {trackingLoadError ||
                    permissionError ||
                    (permissionState === 'granted'
                      ? 'Location permission is enabled, but no recent GPS fix has reached pickup tracking. Check device Location Services and retry.'
                      : 'Your donation request was accepted by the farmer. Grant GPS location permission so your location can be shared and your arrival verified.')}
                </p>
              </div>
            </div>
            {typeof onRequestPermission === 'function' ? (
              <Button
                size="sm"
                onClick={() => {
                  void onRequestPermission();
                  onStatusUpdated?.();
                }}
              >
                {permissionState === 'granted' || permissionState === 'denied' || permissionError || trackingLoadError
                  ? 'Retry Location Sharing'
                  : 'Start Live GPS Tracking'}
              </Button>
            ) : null}
          </div>
        ) : null}

        {isApproaching ? (
          <div className="donation-tracking-banner is-approaching" role="status">
            <div className="donation-tracking-banner-main">
              <Navigation size={20} />
              <div>
                <strong>Approaching Farm Destination</strong>
                <p>
                  Stakeholder is within {Math.max(10, Math.round(remainingKm * 1000))}m of {farmDestinationName}.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {viewerRole === 'farmer' && !farmerReportedArrival && !isConfirmed ? (
          <div className="donation-tracking-banner is-permission" role="status">
            <div className="donation-tracking-banner-main">
              <ShieldCheck size={20} />
              <div>
                <strong>Handover Confirmation Not Ready</strong>
                <p>
                  The Stakeholder must tap the arrival poke button below their live tracking map before you can confirm the handover.
                </p>
              </div>
            </div>
            <Button size="sm" disabled title="Available after the Stakeholder pokes you">
              Confirm Donation
            </Button>
          </div>
        ) : null}

        {arrivalVerified && !isConfirmed ? (
          <div className="donation-tracking-banner is-arrived" role="status">
            <div className="donation-tracking-banner-main">
              <ShieldCheck size={20} />
              <div>
                <strong>Stakeholder Has Arrived</strong>
                <p>
                  {viewerRole === 'farmer'
                    ? farmerReportedArrival
                      ? 'The Stakeholder has poked you to review and confirm the donation handover.'
                      : 'GPS confirms the Stakeholder is at the farm. Wait for them to poke you before confirming the handover.'
                    : `Arrival verified at ${farmDestinationName}. Poke the farmer to review and confirm the handover.`}
                </p>
              </div>
            </div>
            {viewerRole === 'farmer' ? (
              <Button
                size="sm"
                disabled={!canConfirm || confirming}
                title={canConfirm ? 'Confirm the donation handover' : 'Available after the Stakeholder pokes you'}
                onClick={() => setConfirmDialogOpen(true)}
              >
                Confirm Donation
              </Button>
            ) : null}
          </div>
        ) : null}

        {isConfirmed ? (
          <div className="donation-tracking-banner is-confirmed" role="status">
            <div className="donation-tracking-banner-main">
              <CheckCircle2 size={20} />
              <div>
                <strong>Donation Confirmed</strong>
                <p>
                  The farmer confirmed the donation handover for {quantityLabel} of {liveDonation?.productName}. Live GPS sharing has ended.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        <div className="donation-destination-card" aria-label="Donation pickup destination details">
          <div className="donation-destination-item">
            <span>Pickup Destination (Farm)</span>
            <strong>{farmDestinationName}</strong>
            <p>
              <MapPin size={13} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
              {farmDestinationAddress}
            </p>
          </div>
          <div className="donation-destination-item">
            <span>Receiving Stakeholder</span>
            <strong>{virtualOrder.buyerName}</strong>
            <p>Quantity: {quantityLabel}</p>
          </div>
          <div className="donation-destination-item">
            <span>Scheduled Pickup Date</span>
            <strong>
              {activeRecord.pickupDate ? formatDate(activeRecord.pickupDate) : 'Today'}
            </strong>
            <p>Status: {getDonationWorkflowLabel(activeRecord)}</p>
          </div>
        </div>

        <section className="donation-tracking-route-section" aria-labelledby="donation-pickup-route-title">
          <h3 id="donation-pickup-route-title">Pickup route</h3>
          <TrackingRouteSummary
            order={virtualOrder}
            farmerProfile={{
              ...farmerProfile,
              farmName: farmDestinationName,
            }}
            buyerProfile={stakeholderProfile}
            receiverRole="stakeholder"
          />
        </section>

        <section className="donation-tracking-map-section" aria-labelledby="donation-pickup-map-title">
          <div className="donation-tracking-section-heading">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 id="donation-pickup-map-title">Stakeholder location</h3>
                <span className="live-indicator"><span className="live-dot" /> Live</span>
              </div>
              <p>Shown when the Stakeholder grants GPS permission and a live fix is available.</p>
            </div>
          </div>
          <LiveDeliveryMap
            order={virtualOrder}
            farmerProfile={farmerProfile}
            buyerProfile={stakeholderProfile}
            onRouteUpdate={setRouteSnapshot}
            navigationEnabled={!isConfirmed}
            sharerLabelOverride="Stakeholder"
            moverMarkerType="pin"
            requireLivePosition
          />
          <div className="donation-pickup-route-metrics" aria-label="Pickup route information">
            <div>
              <span>Stakeholder Current Location</span>
              <strong>{routeSnapshot?.isInTransit ? 'Live GPS location' : 'Waiting for fresh GPS'}</strong>
            </div>
            <div>
              <span>Farm Pickup Location</span>
              <strong>{farmDestinationName}</strong>
              <p>{farmDestinationAddress}</p>
            </div>
            <div>
              <span>Route Distance</span>
              <strong>{routeDistanceLabel}</strong>
            </div>
            <div>
              <span>Estimated Travel Time</span>
              <strong>{routeDurationLabel}</strong>
            </div>
          </div>
          {viewerRole === 'stakeholder' && !isConfirmed ? (
            <div className="donation-poke-farmer">
              <Button
                size="sm"
                disabled={notifyingFarmer || pokeCooldownSeconds > 0}
                onClick={handleNotifyFarmer}
              >
                <BellRing size={16} />
                {pokeCooldownSeconds > 0
                  ? `Poke Sent · ${pokeCooldownLabel}`
                  : notifyingFarmer
                    ? 'Poking Farmer…'
                    : 'I’ve Arrived — Poke Farmer'}
              </Button>
              <p role={farmerHasBeenNotified && pokeCooldownSeconds === 0 ? 'status' : undefined}>
                {pokeCooldownSeconds > 0
                  ? `The farmer has been notified. You can poke again in ${pokeCooldownLabel}.`
                  : farmerHasBeenNotified
                    ? 'The farmer has been notified. You can send another poke now.'
                  : 'Arrived at the farm? Tap to notify the farmer and request handover confirmation.'}
              </p>
            </div>
          ) : null}
          {viewerRole === 'farmer' && farmerReportedArrival && !arrivalVerified && !isConfirmed ? (
            <div className="donation-tracking-banner is-arrived" role="status">
              <div className="donation-tracking-banner-main">
                <ShieldCheck size={20} />
                <div>
                  <strong>Stakeholder Reports Arrival</strong>
                  <p>The Stakeholder has asked you to review the pickup and confirm the handover.</p>
                </div>
              </div>
              <Button size="sm" disabled={!canConfirm || confirming} onClick={() => setConfirmDialogOpen(true)}>
                Confirm Donation
              </Button>
            </div>
          ) : null}
        </section>
      </div>

      <DonationHandoverConfirmModal
        open={confirmDialogOpen}
        busy={confirming}
        onCancel={() => setConfirmDialogOpen(false)}
        onConfirm={handleConfirmSubmit}
      />
    </DeliveryTrackingOverlay>
  );
}
