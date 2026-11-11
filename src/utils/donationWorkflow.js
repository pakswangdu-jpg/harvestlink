export const DONATION_WORKFLOW_STEPS = [
  { key: 'requested', stepNumber: 1, label: 'Donation Requested' },
  { key: 'accepted', stepNumber: 2, label: 'Accepted by Farmer' },
  { key: 'awaiting_pickup', stepNumber: 3, label: 'Awaiting Stakeholder Pickup' },
  { key: 'on_the_way', stepNumber: 4, label: 'Stakeholder on the Way' },
  { key: 'arrived', stepNumber: 5, label: 'Stakeholder Arrived' },
  { key: 'awaiting_confirmation', stepNumber: 6, label: 'Awaiting Farmer Confirmation' },
  { key: 'confirmed', stepNumber: 7, label: 'Donation Confirmed' },
];

export const DONATION_WORKFLOW_LABELS = {
  requested: 'Donation Requested',
  pending: 'Donation Requested',
  accepted: 'Accepted by Farmer',
  awaiting_pickup: 'Awaiting Stakeholder Pickup',
  on_the_way: 'Stakeholder on the Way',
  arrived: 'Stakeholder Arrived',
  awaiting_confirmation: 'Awaiting Farmer Confirmation',
  confirmed: 'Donation Confirmed',
  completed: 'Donation Confirmed',
  cancelled: 'Cancelled',
  rejected: 'Declined',
  available: 'Available',
  expired: 'Expired',
};

export const APPROACHING_FARM_RADIUS_KM = 0.5;
export const ARRIVAL_GEOFENCE_RADIUS_KM = 0.08;

export function isDonationArrivalVerified(record = {}) {
  if (!record || typeof record !== 'object') return false;
  const pickupStatus = record.pickupStatus || record.pickup_status || '';
  if (pickupStatus === 'arrived' || pickupStatus === 'awaiting_confirmation' || pickupStatus === 'confirmed') {
    return true;
  }
  if (record.arrivedAt || record.arrived_at || record.confirmedAt || record.confirmed_at) {
    return true;
  }
  const readings = Number(record.consecutiveArrivalReadings ?? record.consecutive_arrival_readings ?? 0);
  return Number.isFinite(readings) && readings >= 2;
}

export function resolveDonationPickupStatus(record = {}) {
  if (!record || typeof record !== 'object') return 'none';
  const status = record.status || '';
  const rawPickup = record.pickupStatus || record.pickup_status || 'none';

  if (status === 'completed' || rawPickup === 'confirmed' || record.confirmedAt || record.confirmed_at) {
    return 'confirmed';
  }
  if (status === 'cancelled' || status === 'rejected' || rawPickup === 'cancelled') {
    return 'cancelled';
  }
  if (status === 'expired') {
    return 'expired';
  }
  if (status === 'requested' || status === 'pending') {
    return 'requested';
  }
  if (status === 'scheduled') {
    if (isDonationArrivalVerified(record)) {
      return rawPickup === 'arrived' ? 'arrived' : 'awaiting_confirmation';
    }
    if (
      rawPickup === 'on_the_way' ||
      (record.currentLat != null && record.currentLng != null) ||
      (record.current_lat != null && record.current_lng != null)
    ) {
      return 'on_the_way';
    }
    if (rawPickup === 'accepted') {
      return 'accepted';
    }
    return 'awaiting_pickup';
  }
  if (rawPickup && rawPickup !== 'none') {
    return rawPickup;
  }
  return status || 'none';
}

export function getDonationWorkflowStepIndex(record = {}) {
  const resolved = resolveDonationPickupStatus(record);
  const idx = DONATION_WORKFLOW_STEPS.findIndex((step) => step.key === resolved);
  return idx;
}

export function getDonationWorkflowLabel(record = {}) {
  const resolved = resolveDonationPickupStatus(record);
  return DONATION_WORKFLOW_LABELS[resolved] || DONATION_WORKFLOW_LABELS[record?.status] || 'Scheduled';
}

export function isDonationPickupTrackable(record = {}) {
  if (!record || typeof record !== 'object') return false;
  if (record.status !== 'scheduled') return false;
  const resolved = resolveDonationPickupStatus(record);
  return (
    resolved === 'accepted' ||
    resolved === 'awaiting_pickup' ||
    resolved === 'on_the_way' ||
    resolved === 'arrived' ||
    resolved === 'awaiting_confirmation'
  );
}

export function canFarmerConfirmDonationHandover(record = {}) {
  if (!record || typeof record !== 'object') return false;
  if (record.status !== 'scheduled') return false;
  const resolved = resolveDonationPickupStatus(record);
  if (resolved === 'confirmed' || resolved === 'cancelled') return false;
  return Boolean(record.arrivalNotifiedAt || record.arrival_notified_at);
}
