



export {
  paymentStatusLabel, verificationStatusLabel, donationStatusLabel, deliveryStepLabel, paymentLabel,
} from '../../utils/formatters';

export function verificationTone(value) {
  if (value === 'verified') return 'success';
  if (value === 'rejected') return 'danger';
  return 'warning';
}

export function accountTone(accountStatus) {
  return accountStatus === 'suspended' ? 'danger' : 'success';
}

export function orderStatusTone(status) {
  if (status === 'completed' || status === 'confirmed') return 'success';
  if (status === 'rejected' || status === 'cancelled') return 'danger';
  return 'warning';
}

export function paymentStatusTone(status) {
  if (status === 'paid') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'refunded') return 'neutral';
  return 'warning';
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
