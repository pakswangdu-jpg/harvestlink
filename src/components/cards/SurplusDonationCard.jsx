import { CalendarDays, MapPin, Package, Sprout } from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import { formatDate, formatQuantity, getInitials } from '../../utils/formatters';
import { getExpiryStatus } from '../../utils/constants';

// A real, derivable reference — donation ids look like "donation_<timestamp>_<random>" (see
// storageService.js's createId), so the trailing random segment is a genuine, stable,
// human-scannable reference, the same "receipt number" reasoning shortOrderId() already
// applies to orders — not a fabricated field.
function donationReference(id) {
  return `DN-${String(id).split('_').pop().toUpperCase()}`;
}

// The farmer-facing Surplus Donations page's own card — deliberately separate from the
// shared DonationCard.jsx (still used as-is by the three stakeholder-facing donation pages),
// since redesigning that shared component would restyle pages outside this task's scope.
// One flexible layout rather than three near-duplicate components: which meta rows show
// (organization, pickup date, freshness) follows directly from which fields the donation
// object actually has at that status, not a prop the caller has to pass in.
export default function SurplusDonationCard({ donation, actions }) {
  const expiryStatus = getExpiryStatus(donation.expirationDate);
  const isAvailable = donation.status === 'available';

  return (
    <article className="surplus-card">
      <div className="surplus-card-media">
        {donation.image ? (
          <img src={donation.image} alt={donation.productName} loading="lazy" />
        ) : (
          <Sprout size={28} strokeWidth={2} />
        )}
      </div>

      <div className="surplus-card-body">
        <div className="surplus-card-top">
          <h3>{donation.productName}</h3>
          <StatusBadge value={donation.status} type="donation" />
        </div>

        {donation.requestedByName ? (
          <div className="surplus-card-org">
            <span className="surplus-card-avatar">{getInitials(donation.requestedByName)}</span>
            {donation.requestedByName}
          </div>
        ) : null}

        <div className="surplus-card-meta">
          <span><Package size={14} /> {formatQuantity(donation.quantity)} {donation.unit}</span>
          <span><MapPin size={14} /> {donation.location}</span>
          {donation.pickupDate ? (
            <span><CalendarDays size={14} /> Pickup {formatDate(donation.pickupDate)}</span>
          ) : null}
          {isAvailable ? (
            <span className={`surplus-freshness ${expiryStatus === 'expired' ? 'is-expired' : expiryStatus === 'expiring_soon' ? 'is-expiring' : 'is-fresh'}`}>
              <Sprout size={14} /> {expiryStatus === 'expired' ? 'Expired' : expiryStatus === 'expiring_soon' ? 'Expiring soon' : 'Fresh'}
            </span>
          ) : null}
        </div>

        <p className="surplus-card-ref">{donationReference(donation.id)} · Donated {formatDate(donation.createdAt)}</p>
      </div>

      {actions ? <div className="surplus-card-footer">{actions}</div> : null}
    </article>
  );
}
