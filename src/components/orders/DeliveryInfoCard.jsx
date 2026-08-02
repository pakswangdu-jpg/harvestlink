import {
  Bike, Clock, ExternalLink, Hash, Phone, Truck, User,
} from 'lucide-react';
import StatusBadge from '../common/StatusBadge';

// Buyer-facing (also shown to the farmer as a record of what they booked) — the courier
// booking details the farmer entered after booking on Lalamove's own site/app (see
// BookLalamoveFlow.jsx). "Track Delivery" opens Lalamove's own official tracking page in a
// new tab — HarvestLink never embeds it, scrapes it, or re-implements courier GPS tracking
// itself; Lalamove owns live position, ETA updates, and route navigation entirely.
export default function DeliveryInfoCard({ delivery }) {
  if (!delivery) return null;

  return (
    <div className="panel delivery-info-card">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Courier</p>
          <h2>Delivery Information</h2>
        </div>
        <StatusBadge value={delivery.deliveryStatus} type="courierDeliveryStatus" />
      </div>

      <dl className="delivery-info-grid">
        <div className="delivery-info-item">
          <span className="delivery-info-icon"><Truck size={16} /></span>
          <div><dt>Courier</dt><dd>{delivery.courierCompany}</dd></div>
        </div>
        <div className="delivery-info-item">
          <span className="delivery-info-icon"><User size={16} /></span>
          <div><dt>Driver</dt><dd>{delivery.driverName || 'Not provided'}</dd></div>
        </div>
        <div className="delivery-info-item">
          <span className="delivery-info-icon"><Phone size={16} /></span>
          <div><dt>Contact Number</dt><dd>{delivery.driverPhone || 'Not provided'}</dd></div>
        </div>
        <div className="delivery-info-item">
          <span className="delivery-info-icon"><Bike size={16} /></span>
          <div><dt>Vehicle</dt><dd>{delivery.vehicleType || 'Not provided'}</dd></div>
        </div>
        {delivery.estimatedArrival ? (
          <div className="delivery-info-item">
            <span className="delivery-info-icon"><Clock size={16} /></span>
            <div><dt>Estimated Arrival</dt><dd>{delivery.estimatedArrival}</dd></div>
          </div>
        ) : null}
        {delivery.bookingReference ? (
          <div className="delivery-info-item">
            <span className="delivery-info-icon"><Hash size={16} /></span>
            <div><dt>Booking Reference</dt><dd>{delivery.bookingReference}</dd></div>
          </div>
        ) : null}
      </dl>

      {delivery.trackingUrl ? (
        <a
          className="btn btn-primary btn-md full-width"
          href={delivery.trackingUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={15} /> Track Delivery
        </a>
      ) : null}
    </div>
  );
}
