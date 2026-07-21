import { Check } from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import { getDeliverySequence } from '../../services/orderService';
import { DELIVERY_STEP_LABELS } from '../../utils/constants';
import { formatDate, formatRelativeTime } from '../../utils/formatters';

// A timestamp per step isn't tracked in the schema — only order.createdAt (when it was
// placed) and order.transitStartedAt (when "Start Delivery" was pressed) exist. Every other
// step genuinely has no reliable timestamp to show, so none is shown for those rather than
// guessing from order.updatedAt (which also changes on unrelated things like GPS pings).
function timestampForStep(step, order) {
  if (step === 'pending') return order.createdAt;
  if (step === 'out_for_delivery') return order.transitStartedAt;
  return null;
}

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
            // The final step has no later step to be superseded by, so on its own
            // `index < currentIndex` would never fire — treat it as done once the order
            // itself is marked completed, rather than leaving it stuck on "active" forever.
            const isReached = index < currentIndex || (index === currentIndex && order.status === 'completed');
            const state = isReached ? 'done' : index === currentIndex ? 'active' : 'upcoming';
            const timestamp = state === 'done' || state === 'active' ? timestampForStep(step, order) : null;
            return (
              <li key={step} className={`tracker-step ${state}`}>
                <span className="tracker-icon">
                  {state === 'done' ? <Check size={14} /> : <span className="tracker-icon-dot" />}
                </span>
                <span className="tracker-step-body">
                  <span className="tracker-label">{DELIVERY_STEP_LABELS[step] || step}</span>
                  {timestamp ? (
                    <time className="tracker-timestamp" dateTime={timestamp} title={formatDate(timestamp)}>
                      {formatRelativeTime(timestamp)}
                    </time>
                  ) : null}
                </span>
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
