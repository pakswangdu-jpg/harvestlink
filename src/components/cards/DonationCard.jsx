import { CalendarDays, MapPin, Package, UserRound } from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import { formatDate } from '../../utils/formatters';
import { getExpiryStatus } from '../../utils/constants';
import './DonationCard.css';

function donationQuantity(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  const rounded = Math.round(number * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function donationExpiration(value) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function DonationCard({ donation, actions, variant = 'default', statusValue = donation.status }) {
  const expiryStatus = getExpiryStatus(donation.expirationAt || donation.expirationDate);
  const discovery = variant === 'discovery';

  return (
    <article id={`donation-${donation.id}`} className={`donation-card${discovery ? ' donation-card-discovery' : ''}`}>
      <div className="donation-card-image">
        {donation.image ? <img src={donation.image} alt={donation.productName} /> : <Package size={42} />}
      </div>
      <div className="donation-card-body">
        <div className="donation-card-statuses">
          <span className="donation-card-category">Surplus donation</span>
          <StatusBadge value={statusValue} type="donation" />
          {!discovery && expiryStatus === 'expiring_soon' ? <span className="badge badge-expiring-soon">Expiring soon</span> : null}
          {!discovery && expiryStatus === 'expired' ? <span className="badge badge-expired">Expired</span> : null}
        </div>
        <div className="donation-card-heading">
          <h3>{donation.productName}</h3>
          <p>From {donation.farmerName}</p>
        </div>
        <div className="donation-card-meta">
          <p><MapPin size={16} aria-hidden="true" /><span>{donation.location}</span></p>
          <p><Package size={16} aria-hidden="true" /><span>{donationQuantity(donation.availableQuantity ?? donation.quantity)} {donation.unit} available</span></p>
          {donation.expirationAt || donation.expirationDate ? <p className={discovery && expiryStatus ? `donation-date-${expiryStatus}` : undefined}><CalendarDays size={16} aria-hidden="true" /><span>{discovery ? 'Available until ' : 'Expires: '}{donation.expirationAt ? donationExpiration(donation.expirationAt) : formatDate(donation.expirationDate)}{discovery && expiryStatus === 'expired' ? ' (Expired)' : ''}</span></p> : null}
          {donation.pickupDate ? <p><CalendarDays size={16} aria-hidden="true" /><span>Pickup: {formatDate(donation.pickupDate)}</span></p> : null}
          {donation.requestedByName ? <p><UserRound size={16} aria-hidden="true" /><span>Requested by: {donation.requestedByName}</span></p> : null}
        </div>
      </div>
      {actions ? <div className="donation-card-footer">{actions}</div> : null}
    </article>
  );
}
