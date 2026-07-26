// Real domain logic, not decoration — every function here just says which of the 4 given
// tones (neutral/success/danger/warning) a genuinely-existing status value means, reusing
// the same label resolvers every other page already relies on (src/utils/formatters.js) so
// the actual wording never diverges from the rest of the app.
export {
  paymentStatusLabel, verificationStatusLabel, donationStatusLabel, deliveryStepLabel, paymentLabel,
} from '../../utils/formatters';

export function verificationTone(value) {
  if (value === 'verified') return 'success';
  if (value === 'rejected') return 'danger';
  return 'warning'; // pending
}

export function accountTone(accountStatus) {
  return accountStatus === 'suspended' ? 'danger' : 'success';
}

export function orderStatusTone(status) {
  if (status === 'completed' || status === 'confirmed') return 'success';
  if (status === 'rejected' || status === 'cancelled') return 'danger';
  return 'warning'; // pending
}

export function paymentStatusTone(status) {
  if (status === 'paid') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'refunded') return 'neutral';
  return 'warning'; // pending
}

export function deliveryStatusTone(status) {
  if (status === 'delivered' || status === 'picked_up') return 'success';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}

export function donationTone(status) {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}

export function productStatusTone(status) {
  return status === 'active' ? 'success' : 'neutral';
}
