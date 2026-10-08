import { CalendarDays, MapPin, Package, UserRound } from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import { formatDate } from '../../utils/formatters';
import { getExpiryStatus } from '../../utils/constants';
import './DonationCard.css';

export default function DonationCard({ donation, actions }) {
  const expiryStatus = getExpiryStatus(donation.expirationDate);

  return (
    <article className="donation-card">
      <div className="donation-card-image">
        {donation.image ? <img src={donation.image} alt={donation.productName} /> : <Package size={42} />}
      </div>
      <div className="donation-card-body">
        <div className="donation-card-statuses">
          <span className="donation-card-category">Surplus donation</span>
          <StatusBadge value={donation.status} type="donation" />
          {expiryStatus === 'expiring_soon' ? <span className="badge badge-expiring-soon">Expiring soon</span> : null}
          {expiryStatus === 'expired' ? <span className="badge badge-expired">Expired</span> : null}
        </div>
        <div className="donation-card-heading">
          <h3>{donation.productName}</h3>
          <p>From {donation.farmerName}</p>
        </div>
        <div className="donation-card-meta">
          <p><MapPin size={16} aria-hidden="true" /><span>{donation.location}</span></p>
          <p><Package size={16} aria-hidden="true" /><span>{donation.quantity} {donation.unit} available</span></p>
          {donation.expirationDate ? <p><CalendarDays size={16} aria-hidden="true" /><span>Expires: {formatDate(donation.expirationDate)}</span></p> : null}
          {donation.pickupDate ? <p><CalendarDays size={16} aria-hidden="true" /><span>Pickup: {formatDate(donation.pickupDate)}</span></p> : null}
          {donation.requestedByName ? <p><UserRound size={16} aria-hidden="true" /><span>Requested by: {donation.requestedByName}</span></p> : null}
        </div>
      </div>
      {actions ? <div className="donation-card-footer">{actions}</div> : null}
    </article>
  );
}
