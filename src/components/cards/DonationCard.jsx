import { MapPin, Package } from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import { formatDate } from '../../utils/formatters';

export default function DonationCard({ donation, actions }) {
  return (
    <article className="product-card donation-card">
      <div className="product-image">
        {donation.image ? <img src={donation.image} alt={donation.productName} /> : <Package size={42} />}
      </div>
      <div className="product-card-body">
        <div className="product-card-top">
          <span className="category-pill">Surplus donation</span>
          <StatusBadge value={donation.status} type="donation" />
        </div>
        <h3>{donation.productName}</h3>
        <p className="muted">From {donation.farmerName}</p>
        <div className="product-meta">
          <span><MapPin size={15} /> {donation.location}</span>
          <span>{donation.quantity} {donation.unit} available</span>
          {donation.pickupDate ? <span>Pickup: {formatDate(donation.pickupDate)}</span> : null}
          {donation.requestedByName ? <span>Requested by: {donation.requestedByName}</span> : null}
        </div>
      </div>
      {actions ? <div className="product-card-footer donation-card-footer">{actions}</div> : null}
    </article>
  );
}
