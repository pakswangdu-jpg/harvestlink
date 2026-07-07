import {
  deliveryMethodLabel,
  deliveryStepLabel,
  donationStatusLabel,
  paymentLabel,
  paymentStatusLabel,
  priceReviewStatusLabel,
  verificationStatusLabel,
} from '../../utils/formatters';

const LABEL_RESOLVERS = {
  payment: paymentLabel,
  paymentStatus: paymentStatusLabel,
  deliveryMethod: deliveryMethodLabel,
  deliveryStatus: deliveryStepLabel,
  donation: donationStatusLabel,
  priceReview: priceReviewStatusLabel,
  verification: verificationStatusLabel,
};

export default function StatusBadge({ value, type = 'status' }) {
  const resolve = LABEL_RESOLVERS[type];
  const label = resolve ? resolve(value) : value;

  return (
    <span className={`badge badge-${type} badge-${String(value).toLowerCase()}`}>
      {label}
    </span>
  );
}
