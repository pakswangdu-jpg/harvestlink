import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Eye, MapPin, Package, UserRound } from 'lucide-react';
import Modal from '../admin/Modal';
import StatusBadge from '../common/StatusBadge';
import ProductImageGallery from '../products/ProductImageGallery';
import { formatDate } from '../../utils/formatters';
import { getExpiryStatus } from '../../utils/constants';
import './DonationCard.css';
import './ProductQuickView.css';

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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const expiryStatus = getExpiryStatus(donation.expirationAt || donation.expirationDate);
  const discovery = variant === 'discovery';
  const expiration = donation.expirationAt
    ? donationExpiration(donation.expirationAt)
    : donation.expirationDate && formatDate(donation.expirationDate);
  const available = donationQuantity(donation.availableQuantity ?? donation.quantity);
  const coverImage = donation.image || donation.imageUrls?.[0];

  return (
    <article id={`donation-${donation.id}`} className={`donation-card${discovery ? ' donation-card-discovery' : ''}`}>
      {discovery ? (
        <button
          type="button"
          className="donation-card-image donation-card-details-trigger product-card-media-trigger"
          aria-haspopup="dialog"
          aria-label={`View ${donation.productName} donation details`}
          onClick={() => setDetailsOpen(true)}
        >
          {coverImage ? <img src={coverImage} alt="" /> : <Package size={42} aria-hidden="true" />}
          <span className="product-card-media-hint"><Eye size={14} aria-hidden="true" /> View details</span>
        </button>
      ) : (
        <div className="donation-card-image">
          {coverImage ? <img src={coverImage} alt={donation.productName} /> : <Package size={42} />}
        </div>
      )}
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
          <p><Package size={16} aria-hidden="true" /><span>{available} {donation.unit} available</span></p>
          {expiration ? <p className={discovery && expiryStatus ? `donation-date-${expiryStatus}` : undefined}><CalendarDays size={16} aria-hidden="true" /><span>{discovery ? 'Available until ' : 'Expires: '}{expiration}{discovery && expiryStatus === 'expired' ? ' (Expired)' : ''}</span></p> : null}
          {donation.pickupDate ? <p><CalendarDays size={16} aria-hidden="true" /><span>Pickup: {formatDate(donation.pickupDate)}</span></p> : null}
          {donation.requestedByName ? <p><UserRound size={16} aria-hidden="true" /><span>Requested by: {donation.requestedByName}</span></p> : null}
        </div>
      </div>
      {detailsOpen ? createPortal(
        <Modal
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          eyebrow="Surplus donation"
          title="Donation details"
          dialogLabel={`${donation.productName} donation details`}
          className="product-quick-view-overlay"
        >
          <div className="product-quick-view">
            {coverImage ? (
              <ProductImageGallery
                product={{ name: donation.productName, image: coverImage, imageUrls: donation.imageUrls }}
                className="product-quick-view-image"
              />
            ) : null}
            <div className="product-quick-view-heading">
              <div>
                <h3>{donation.productName}</h3>
                <p>From {donation.farmerName}</p>
              </div>
              <StatusBadge value={statusValue} type="donation" />
            </div>
            <p className="product-quick-view-stock">{available} {donation.unit} available</p>
            {donation.description?.trim() ? (
              <section className="product-quick-view-description">
                <h4>Description</h4>
                <p>{donation.description.trim()}</p>
              </section>
            ) : null}
            <dl className="product-quick-view-meta">
              {donation.location ? <div><dt>Location</dt><dd>{donation.location}</dd></div> : null}
              {expiration ? <div><dt>Available until</dt><dd>{expiration}</dd></div> : null}
            </dl>
          </div>
        </Modal>,
        document.body,
      ) : null}
      {actions ? <div className="donation-card-footer">{actions}</div> : null}
    </article>
  );
}
