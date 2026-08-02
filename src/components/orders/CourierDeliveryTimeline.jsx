import { Check } from 'lucide-react';
import { getDeliverySequence } from '../../services/orderService';

// The courier (Lalamove) order's own timeline — a different step SET than the generic
// OrderTracker (which just walks DELIVERY_SEQUENCES literally: Preparing/Packed/Out for
// delivery/Delivered), since this one calls out the payment-verification and
// courier-booking moments specifically. Shown instead of OrderTracker for
// deliveryMethod === 'courier' orders (see OrderTracking.jsx) — reuses the same
// .tracker/.tracker-step styling as OrderTracker/PaymentProgressTracker for a consistent
// look rather than introducing a third visual language.
export default function CourierDeliveryTimeline({ order, delivery }) {
  const sequence = getDeliverySequence(order.deliveryMethod);
  const stepIndex = Math.max(0, sequence.indexOf(order.deliveryStatus));
  const isOrderActive = order.status === 'confirmed' || order.status === 'completed';
  const isRejectedOrCancelled = order.status === 'rejected' || order.status === 'cancelled';

  // COD has no separate verification step (it's collected on delivery, never "verified" in
  // advance — see payments.controller.js) — so it counts as done the moment the order itself
  // is confirmed. GCash only counts once the farmer has actually approved the buyer's
  // submitted payment proof.
  const isPaymentVerified = order.paymentMethod === 'cod' ? isOrderActive : order.paymentStatus === 'paid';
  const isPreparingOrLater = isOrderActive && stepIndex >= sequence.indexOf('preparing');
  const isBooked = Boolean(delivery);
  const isOutForDeliveryOrLater = isOrderActive && stepIndex >= sequence.indexOf('out_for_delivery');
  const isDelivered = isOrderActive && stepIndex >= sequence.indexOf('delivered');
  const isCompleted = order.status === 'completed';

  const steps = [
    { key: 'placed', label: 'Order Placed', done: true },
    { key: 'payment', label: 'Payment Verified', done: isPaymentVerified },
    { key: 'preparing', label: 'Preparing Products', done: isPreparingOrLater },
    { key: 'booked', label: 'Booked with Lalamove', done: isBooked },
    { key: 'out_for_delivery', label: 'Out for Delivery', done: isOutForDeliveryOrLater },
    { key: 'delivered', label: 'Delivered', done: isDelivered },
    { key: 'completed', label: 'Completed', done: isCompleted },
  ];
  // The first not-yet-done step is the "current" one — everything before it is done,
  // everything after is upcoming; matches how OrderTracker/PaymentProgressTracker compute
  // 'active' too.
  const activeIndex = steps.findIndex((step) => !step.done);

  if (isRejectedOrCancelled) {
    return (
      <p className="muted tracker-inactive">
        {order.status === 'rejected' ? 'This order was rejected by the farmer.' : 'This order was cancelled.'}
      </p>
    );
  }

  return (
    <ol className="tracker">
      {steps.map((step, index) => {
        const state = step.done ? 'done' : index === activeIndex ? 'active' : 'upcoming';
        return (
          <li key={step.key} className={`tracker-step ${state}`}>
            <span className="tracker-icon">
              {state === 'done' ? <Check size={14} /> : <span className="tracker-icon-dot" />}
            </span>
            <span className="tracker-step-body">
              <span className="tracker-label">{step.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
