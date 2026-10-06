import { Truck } from 'lucide-react';
import { formatRelativeTime, getInitials } from '../../utils/formatters';
import './LiveDeliverySummary.css';

const CONNECTION_LABELS = {
  online: 'Online',
  offline: 'Offline',
  reconnecting: 'Reconnecting',
  'gps-lost': 'GPS signal lost',
};

export default function LiveDeliverySummary({
  order,
  eta,
  distance,
  arrival,
  speed,
  connectionStatus,
  lastUpdatedAt,
  deliveryStatus,
  deliveryStatusBadge,
}) {
  const relativeTime = lastUpdatedAt ? formatRelativeTime(lastUpdatedAt) : null;

  return (
    <section className="delivery-live-summary" aria-label="Live delivery summary">
      <header className="delivery-live-identity">
        <div className="delivery-live-driver">
          <span className="delivery-live-avatar" aria-hidden="true">
            {order.farmerAvatarUrl
              ? <img src={order.farmerAvatarUrl} alt="" />
              : getInitials(order.farmerName)}
          </span>
          <div>
            <strong>{order.farmerName}</strong>
            <span>Delivery driver</span>
          </div>
        </div>
        {order.vehiclePlateNumber ? (
          <div className="delivery-live-vehicle">
            <span>Vehicle</span>
            <strong>{order.vehiclePlateNumber}</strong>
          </div>
        ) : null}
      </header>

      <dl className="delivery-live-progress">
        <div className="delivery-live-eta"><dt>Estimated arrival</dt><dd>{eta}</dd></div>
        <div><dt>Remaining</dt><dd>{distance}</dd></div>
        <div><dt>Arrives around</dt><dd>{arrival}</dd></div>
        <div><dt>Speed</dt><dd>{speed}</dd></div>
      </dl>

      <footer className="delivery-live-footer">
        <div className="delivery-live-activity">
          <span className={`delivery-live-dot status-${connectionStatus || 'waiting'}`} aria-hidden="true" />
          <div>
            <strong>{CONNECTION_LABELS[connectionStatus] || 'Waiting'}</strong>
            <span>{relativeTime
              ? `Location updated ${relativeTime === 'Just now' ? 'just now' : relativeTime}`
              : 'Waiting for location update'}</span>
          </div>
        </div>
        {deliveryStatus ? (
          <span className={`delivery-live-state tracking-${deliveryStatus.key}`}>
            <Truck size={15} aria-hidden="true" />
            {deliveryStatus.label.charAt(0) + deliveryStatus.label.slice(1).toLowerCase()}
          </span>
        ) : deliveryStatusBadge}
      </footer>
    </section>
  );
}
