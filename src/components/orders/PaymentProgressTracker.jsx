import { Check, X } from 'lucide-react';
import { getDeliverySequence } from '../../services/orderService';

// A GCash-specific companion to OrderTracker.jsx — that component tracks delivery steps
// only; this one adds the two payment-verification steps in front of them (see
// payments.controller.js's submitPaymentProof/approvePaymentVerification/
// rejectPaymentVerification), so a buyer can see "did my payment go through" and "is my
// order moving" as one continuous timeline. Reuses OrderTracker's .tracker/.tracker-step
// classes for a consistent look.
export default function PaymentProgressTracker({ order }) {
  const isPickup = order.deliveryMethod === 'buyer_pickup';
  const sequence = getDeliverySequence(order.deliveryMethod);
  const currentIndex = sequence.indexOf(order.deliveryStatus);
  const isOrderActive = order.status === 'confirmed' || order.status === 'completed';

  const deliveryStepState = (stepName) => {
    if (!isOrderActive) return 'upcoming';
    const index = sequence.indexOf(stepName);
    if (index < currentIndex || (index === currentIndex && order.status === 'completed')) return 'done';
    if (index === currentIndex) return 'active';
    return 'upcoming';
  };

  const verificationStatus = order.paymentVerificationStatus;
  const verificationState = verificationStatus === 'approved' ? 'done' : verificationStatus === 'rejected' ? 'error' : 'active';
  const verificationLabel = verificationStatus === 'approved'
    ? 'Payment Verified'
    : verificationStatus === 'rejected'
      ? 'Verification Failed'
      : 'Verification Pending';

  const steps = [
    { key: 'sent', label: 'Payment Sent', state: 'done' },
    { key: 'uploaded', label: 'Receipt Uploaded', state: order.paymentReceiptUrl ? 'done' : 'active' },
    { key: 'verification', label: verificationLabel, state: verificationState },
    { key: 'preparing', label: 'Preparing Order', state: deliveryStepState('preparing') },
    { key: 'transit', label: isPickup ? 'Ready for Pickup' : 'Out for Delivery', state: deliveryStepState(isPickup ? 'ready_for_pickup' : 'out_for_delivery') },
    { key: 'delivered', label: isPickup ? 'Picked Up' : 'Delivered', state: deliveryStepState(isPickup ? 'picked_up' : 'delivered') },
  ];

  return (
    <ol className="tracker payment-progress-tracker">
      {steps.map((step) => (
        <li key={step.key} className={`tracker-step ${step.state}`}>
          <span className="tracker-icon">
            {step.state === 'done' ? <Check size={14} /> : step.state === 'error' ? <X size={14} /> : <span className="tracker-icon-dot" />}
          </span>
          <span className="tracker-step-body">
            <span className="tracker-label">{step.label}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
