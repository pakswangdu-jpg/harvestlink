import { Check, CircleX } from 'lucide-react';
import { buildWholesaleTimeline } from '../../../backend/shared/wholesaleDelivery.js';
import { formatDate, formatTime } from '../../utils/formatters';
import './WholesaleOrderTimeline.css';

function formatDateTime(isoString) {
  if (!isoString) return '';
  return `${formatDate(isoString)} · ${formatTime(isoString)}`;
}

export default function WholesaleOrderTimeline({ order }) {
  const steps = buildWholesaleTimeline(order);
  const isTerminal = order.status === 'rejected' || order.status === 'cancelled';

  return (
    <div className="order-tracker">
      {isTerminal ? (
        <div className="form-alert error has-icon mb-3">
          <CircleX size={16} aria-hidden="true" />
          <div>
            <strong>This wholesale order was {order.status}.</strong>
            {order.rejectionReason || order.cancellationReason ? (
              <p>{order.rejectionReason || order.cancellationReason}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <ol className="wholesale-timeline" aria-label="Wholesale order status timeline">
        {steps.map((step) => {
          const stateClass = step.state === 'completed'
            ? 'is-completed'
            : step.state === 'current'
              ? 'is-current'
              : 'is-pending';
          return (
            <li key={step.key} className={`wholesale-timeline-item ${stateClass}`}>
              <span className="wholesale-timeline-marker" aria-hidden="true">
                {step.state === 'completed' || step.state === 'current'
                  ? <Check size={13} strokeWidth={2.5} />
                  : <span className="wholesale-timeline-dot" />}
              </span>
              <div className="wholesale-timeline-content">
                <div className="wholesale-timeline-header">
                  <span className="wholesale-timeline-title">{step.title}</span>
                  {step.occurredAt ? (
                    <time className="wholesale-timeline-time" dateTime={step.occurredAt}>
                      {formatDateTime(step.occurredAt)}
                    </time>
                  ) : null}
                </div>
                <p className="wholesale-timeline-description">{step.description}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
