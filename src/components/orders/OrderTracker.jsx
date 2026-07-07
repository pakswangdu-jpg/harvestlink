import { Check, Circle } from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import { getDeliverySequence } from '../../services/orderService';
import { DELIVERY_STEP_LABELS } from '../../utils/constants';

export default function OrderTracker({ order }) {
  const isActive = order.status === 'confirmed' || order.status === 'completed';
  const sequence = getDeliverySequence(order.deliveryMethod);
  const currentIndex = sequence.indexOf(order.deliveryStatus);

  return (
    <div className="order-tracker">
      <div className="tracker-summary">
        <div>
          <span>Order status</span>
          <StatusBadge value={order.status} />
        </div>
        <div>
          <span>Payment</span>
          <StatusBadge value={order.paymentStatus} type="paymentStatus" />
        </div>
      </div>

      {isActive ? (
        <ol className="tracker">
          {sequence.map((step, index) => {
            const state = index < currentIndex ? 'done' : index === currentIndex ? 'active' : 'upcoming';
            return (
              <li key={step} className={`tracker-step ${state}`}>
                <span className="tracker-icon">
                  {state === 'done' ? <Check size={14} /> : <Circle size={8} />}
                </span>
                <span className="tracker-label">{DELIVERY_STEP_LABELS[step] || step}</span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="muted tracker-inactive">
          {order.status === 'pending' && 'Waiting for the farmer to confirm this order before delivery tracking starts.'}
          {order.status === 'rejected' && 'This order was rejected by the farmer.'}
          {order.status === 'cancelled' && 'This order was cancelled.'}
        </p>
      )}
    </div>
  );
}
