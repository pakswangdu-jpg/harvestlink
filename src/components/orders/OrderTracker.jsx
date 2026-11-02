import { Check, CircleX } from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import { getDeliverySequence } from '../../services/orderService';
import { DELIVERY_STEP_LABELS } from '../../utils/constants';
import { formatDate, formatRelativeTime } from '../../utils/formatters';





function timestampForStep(step, order) {
  if (step === 'pending') return order.createdAt;
  if (step === 'out_for_delivery') return order.transitStartedAt;
  return null;
}

const TERMINAL_STEP_LABEL = {
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

function RecordedOrderEvents({ order, events, sequence }) {
  const isTerminal = ['rejected', 'cancelled'].includes(order.status);
  const currentIndex = sequence.indexOf(order.deliveryStatus);
  const recordedStatuses = new Set(events.map((event) => event.status));
  const upcomingSteps = order.status === 'confirmed' || order.status === 'completed'
    ? sequence
      .filter((step, index) => step !== 'pending' && index > currentIndex && !recordedStatuses.has(step))
      .map((step) => ({ status: step, title: DELIVERY_STEP_LABELS[step] || step }))
    : [];
  const nextOrderStep = order.status === 'pending' && !recordedStatuses.has('confirmed')
    ? [{ status: 'confirmed', title: 'Farmer confirmation' }]
    : [];

  return (
    <ol className="tracker" aria-label="Order activity timeline">
      {events.map((event, index) => {
        const isCurrent = !isTerminal && order.status !== 'completed' && index === events.length - 1;
        const state = event.status === 'rejected' || event.status === 'cancelled' ? 'error' : isCurrent ? 'active' : 'done';
        return (
          <li key={event.id} className={`tracker-step ${state}`}>
            <span className="tracker-icon">{state === 'done' ? <Check size={14} /> : <span className="tracker-icon-dot" />}</span>
            <span className="tracker-step-body">
              <span className="tracker-label">{event.title || DELIVERY_STEP_LABELS[event.status] || labelStatus(event.status)}</span>
              {event.occurredAt ? (
                <time className="tracker-timestamp" dateTime={event.occurredAt} title={formatDate(event.occurredAt)}>
                  {formatRelativeTime(event.occurredAt)}
                </time>
              ) : null}
              {event.description ? <span className="tracker-event-description">{event.description}</span> : null}
            </span>
          </li>
        );
      })}
      {[...nextOrderStep, ...upcomingSteps].map((step) => (
        <li key={`upcoming-${step.status}`} className="tracker-step upcoming">
          <span className="tracker-icon"><span className="tracker-icon-dot" /></span>
          <span className="tracker-step-body"><span className="tracker-label">{step.title}</span></span>
        </li>
      ))}
    </ol>
  );
}

function labelStatus(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function OrderTracker({ order, isFarmer = false, showSummary = true }) {
  const isActive = order.status === 'confirmed' || order.status === 'completed';
  const sequence = getDeliverySequence(order.deliveryMethod);
  const currentIndex = sequence.indexOf(order.deliveryStatus);
  const recordedEvents = Array.isArray(order.deliveryEvents)
    ? order.deliveryEvents.filter((event) => event?.id && event.occurredAt)
    : [];

  return (
    <div className="order-tracker">
      {showSummary ? <div className="tracker-summary">
        <div>
          <span>Order status</span>
          <StatusBadge value={order.status} />
        </div>
        <div>
          <span>Payment</span>
          <StatusBadge value={order.paymentStatus} type="paymentStatus" />
        </div>
      </div> : null}

      {recordedEvents.length ? (
        <RecordedOrderEvents order={order} events={recordedEvents} sequence={sequence} />
      ) : isActive ? (
        <ol className="tracker">
          {sequence.map((step, index) => {



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
      ) : order.status === 'rejected' || order.status === 'cancelled' ? (
        <>
          <div className="form-alert error has-icon">
            <CircleX size={16} />
            <div>
              <strong>This order was {order.status}.</strong>
              <p>If you have any questions, you can message the {isFarmer ? 'buyer' : 'farmer'}.</p>
            </div>
          </div>
          <ol className="tracker">
            <li className="tracker-step done">
              <span className="tracker-icon"><Check size={14} /></span>
              <span className="tracker-step-body">
                <span className="tracker-label">Order placed</span>
                <time className="tracker-timestamp" dateTime={order.createdAt} title={formatDate(order.createdAt)}>
                  {formatRelativeTime(order.createdAt)}
                </time>
              </span>
            </li>
            <li className="tracker-step error">
              <span className="tracker-icon"><CircleX size={14} /></span>
              <span className="tracker-step-body">
                <span className="tracker-label">{TERMINAL_STEP_LABEL[order.status]}</span>
                <time className="tracker-timestamp" dateTime={order.updatedAt} title={formatDate(order.updatedAt)}>
                  {formatRelativeTime(order.updatedAt)}
                </time>
              </span>
            </li>
          </ol>
        </>
      ) : (
        <p className="muted tracker-inactive">
          Waiting for the farmer to confirm this order before delivery tracking starts.
        </p>
      )}
    </div>
  );
}
