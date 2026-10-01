import { useState } from 'react';
import { Check } from 'lucide-react';
import { getDeliverySequence } from '../../services/orderService';
import { updateDeliveryStatus } from '../../services/deliveryService';
import { courierDeliveryStatusLabel } from '../../utils/formatters';
import Button from '../common/Button';











const LALAMOVE_NARRATION_SEQUENCE = ['booked', 'assigning_driver', 'driver_assigned', 'picked_up', 'delivered'];
const MANUAL_NARRATION_SEQUENCE = ['booked', 'waiting_for_pickup', 'picked_up', 'delivered'];








export default function CourierDeliveryTimeline({ order, delivery, isFarmer, onDeliveryUpdate }) {
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState('');

  const sequence = getDeliverySequence(order.deliveryMethod);
  const stepIndex = Math.max(0, sequence.indexOf(order.deliveryStatus));
  const isOrderActive = order.status === 'confirmed' || order.status === 'completed';
  const isRejectedOrCancelled = order.status === 'rejected' || order.status === 'cancelled';





  const isPaymentVerified = order.paymentMethod === 'cod' ? isOrderActive : order.paymentStatus === 'paid';
  const isPreparingOrLater = isOrderActive && stepIndex >= sequence.indexOf('preparing');
  const isBooked = Boolean(delivery);
  const isCompleted = order.status === 'completed';




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



  const activeIndex = steps.findIndex((step) => !step.done);




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
