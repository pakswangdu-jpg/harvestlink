import { Check } from 'lucide-react';
import { getDeliverySequence } from '../../services/orderService';
import { DELIVERY_STEP_LABELS } from '../../utils/constants';
import { formatDate, formatRelativeTime } from '../../utils/formatters';

export default function CourierDeliveryTimeline({ order, delivery }) {
  const recordedEvents = Array.isArray(order.deliveryEvents)
    ? order.deliveryEvents.filter((event) => event?.id && event.occurredAt)
    : [];
  if (['rejected', 'cancelled'].includes(order.status) && !recordedEvents.length) {
    return <p className="muted tracker-inactive">This order was {order.status}.</p>;
  }
  const active = ['confirmed', 'completed'].includes(order.status);
  const sequence = getDeliverySequence(order.deliveryMethod);
  const index = sequence.indexOf(order.deliveryStatus);
  if (recordedEvents.length) {
    const recordedStatuses = new Set(recordedEvents.map((event) => event.status));
    const upcoming = order.status === 'pending'
      ? (recordedStatuses.has('confirmed') ? [] : [{ status: 'confirmed', title: 'Farmer confirmation' }])
      : order.status !== 'confirmed'
        ? []
        : sequence
          .filter((step, stepIndex) => step !== 'pending' && stepIndex > index)
          .flatMap((step) => step === 'out_for_delivery'
            && order.deliveryMethod === 'courier'
            && index >= sequence.indexOf('packed')
            && !recordedStatuses.has('booked')
            ? [{ status: 'booked', title: 'Courier booking' }, { status: step, title: DELIVERY_STEP_LABELS[step] || step }]
            : [{ status: step, title: DELIVERY_STEP_LABELS[step] || step }])
          .filter((step) => !recordedStatuses.has(step.status));

    return (
      <ol className="tracker" aria-label="Courier delivery progress">
        {recordedEvents.map((event, eventIndex) => {
          const isTerminalEvent = ['rejected', 'cancelled'].includes(event.status);
          const current = !isTerminalEvent && order.status !== 'completed' && eventIndex === recordedEvents.length - 1;
          const state = isTerminalEvent ? 'error' : current ? 'active' : 'done';
          return (
            <li key={event.id} className={`tracker-step ${state}`}>
              <span className="tracker-icon">{state === 'done' ? <Check size={14} /> : <span className="tracker-icon-dot" />}</span>
              <span className="tracker-step-body">
                <span className="tracker-label">{event.title || DELIVERY_STEP_LABELS[event.status] || event.status}</span>
                <time className="tracker-timestamp" dateTime={event.occurredAt} title={formatDate(event.occurredAt)}>
                  {formatRelativeTime(event.occurredAt)}
                </time>
                {event.description ? <span className="tracker-event-description">{event.description}</span> : null}
              </span>
            </li>
          );
        })}
        {upcoming.map((step) => (
          <li key={`upcoming-${step.status}`} className="tracker-step upcoming">
            <span className="tracker-icon"><span className="tracker-icon-dot" /></span>
            <span className="tracker-step-body"><span className="tracker-label">{step.title}</span></span>
          </li>
        ))}
      </ol>
    );
  }

  const delivered = order.deliveryStatus === 'delivered' || order.status === 'completed';
  const handedOver = delivered || order.deliveryStatus === 'out_for_delivery';
  const steps = [
    ['placed', 'Order placed', true],
    ['confirmed', 'Farmer confirmed', active],
    ['preparing', 'Preparing', active && index >= sequence.indexOf('preparing')],
    ['packed', 'Packed', active && index >= sequence.indexOf('packed')],
    ['booked', 'Courier booked', Boolean(delivery)],
    ['handover', 'Handed to courier', handedOver],
    ['delivered', 'Delivered', delivered],
  ];
  const activeIndex = steps.findIndex((step) => !step[2]);
  return <ol className="tracker" aria-label="Courier delivery progress">
    {steps.map(([key, label, done], stepIndex) => {
      const state = done ? 'done' : stepIndex === activeIndex ? 'active' : 'upcoming';
      return <li key={key} className={`tracker-step ${state}`}>
        <span className="tracker-icon">{done ? <Check size={14} /> : <span className="tracker-icon-dot" />}</span>
        <span className="tracker-step-body"><span className="tracker-label">{label}</span></span>
      </li>;
    })}
  </ol>;
}
