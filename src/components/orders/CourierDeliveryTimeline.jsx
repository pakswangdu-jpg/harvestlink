import { useState } from 'react';
import { Check } from 'lucide-react';
import { getDeliverySequence } from '../../services/orderService';
import { updateDeliveryStatus } from '../../services/deliveryService';
import { courierDeliveryStatusLabel } from '../../utils/formatters';
import Button from '../common/Button';

// The delivery's own timeline, once booked — separate from order.deliveryStatus (which only
// ever advances via the buyer's own "Got it" confirmation, see orderService.js). Two paths
// populate this now: the real Lalamove webhook (delivery.lalamoveOrderId set — see
// backend/src/controllers/webhooks/lalamoveWebhook.controller.js) reports
// assigning_driver/driver_assigned/picked_up/delivered automatically; an order still on the
// older manual-entry fallback (no lalamoveOrderId — the farmer booked outside HarvestLink and
// typed the details in, see deliveries.controller.js's updateDeliveryStatus) has the farmer
// report waiting_for_pickup/picked_up/delivered by hand instead. Each order only ever takes
// one path, so only that path's steps are shown — never a merged list with steps that path
// can't actually reach.
const LALAMOVE_NARRATION_SEQUENCE = ['booked', 'assigning_driver', 'driver_assigned', 'picked_up', 'delivered'];
const MANUAL_NARRATION_SEQUENCE = ['booked', 'waiting_for_pickup', 'picked_up', 'delivered'];

// The courier (Lalamove) order's own timeline — a different step SET than the generic
// OrderTracker (which just walks DELIVERY_SEQUENCES literally: Preparing/Packed/Out for
// delivery/Delivered), since this one calls out the payment-verification, courier-booking,
// and (once booked) the farmer's own hand-reported pickup/delivery progress. Shown instead of
// OrderTracker for deliveryMethod === 'courier' orders (see OrderTracking.jsx), reusing the
// same .tracker/.tracker-step styling as OrderTracker/PaymentProgressTracker for a consistent
// look rather than introducing a third visual language.
export default function CourierDeliveryTimeline({ order, delivery, isFarmer, onDeliveryUpdate }) {
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState('');

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
  const isCompleted = order.status === 'completed';

  // Real Lalamove booking (delivery.lalamoveOrderId set by createLalamoveDeliveryForOrder /
  // kept current by the webhook) shows the automatic 5-step path; a delivery still on the
  // manual-entry fallback shows the original 4-step farmer-narrated one instead.
  const isLalamoveBooked = Boolean(delivery?.lalamoveOrderId);
  const narrationSequence = isLalamoveBooked ? LALAMOVE_NARRATION_SEQUENCE : MANUAL_NARRATION_SEQUENCE;
  const narrationIndex = delivery ? narrationSequence.indexOf(delivery.deliveryStatus) : -1;

  const narrationSteps = isLalamoveBooked
    ? [
      { key: 'assigning_driver', label: 'Finding a Driver', done: narrationIndex >= 1 },
      { key: 'driver_assigned', label: 'Driver Assigned', done: narrationIndex >= 2 },
      { key: 'picked_up', label: 'Picked Up', done: narrationIndex >= 3 },
    ]
    : [
      { key: 'waiting_for_pickup', label: 'Waiting for Pickup', done: narrationIndex >= 1 },
      { key: 'picked_up', label: 'Picked Up', done: narrationIndex >= 2 },
    ];
  const isDelivered = narrationIndex >= narrationSequence.length - 1 || isCompleted;

  const steps = [
    { key: 'placed', label: 'Order Placed', done: true },
    { key: 'accepted', label: 'Farmer Accepted', done: isOrderActive },
    { key: 'payment', label: 'Payment Verified', done: isPaymentVerified },
    { key: 'preparing', label: 'Preparing Products', done: isPreparingOrLater },
    { key: 'booked', label: 'Booked with Lalamove', done: isBooked },
    ...narrationSteps,
    { key: 'delivered', label: 'Delivered', done: isDelivered },
  ];
  // The first not-yet-done step is the "current" one — everything before it is done,
  // everything after is upcoming; matches how OrderTracker/PaymentProgressTracker compute
  // 'active' too.
  const activeIndex = steps.findIndex((step) => !step.done);

  // Only offered on the manual-entry fallback path — once a real Lalamove order exists, the
  // webhook is the sole source of truth for these steps (see handleLalamoveWebhook), and the
  // buyer frontend/farmer button must not be able to fabricate a status change for it.
  const nextNarrationStatus = !isLalamoveBooked && isBooked && narrationIndex !== -1
    ? narrationSequence[narrationIndex + 1]
    : null;

  const handleAdvance = async () => {
    if (!nextNarrationStatus) return;
    setIsAdvancing(true);
    setAdvanceError('');
    try {
      const updated = await updateDeliveryStatus(order.id, nextNarrationStatus);
      onDeliveryUpdate?.(updated);
    } catch (error) {
      setAdvanceError(error.message || 'Could not update the delivery status.');
    } finally {
      setIsAdvancing(false);
    }
  };

  if (isRejectedOrCancelled) {
    return (
      <p className="muted tracker-inactive">
        {order.status === 'rejected' ? 'This order was rejected by the farmer.' : 'This order was cancelled.'}
      </p>
    );
  }

  return (
    <>
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

      {isFarmer && nextNarrationStatus ? (
        <div className="tracker-manual-advance">
          {advanceError ? <div className="form-alert error">{advanceError}</div> : null}
          <Button size="sm" variant="secondary" onClick={handleAdvance} disabled={isAdvancing}>
            {isAdvancing ? 'Updating…' : `Mark as ${courierDeliveryStatusLabel(nextNarrationStatus)}`}
          </Button>
        </div>
      ) : null}
    </>
  );
}
