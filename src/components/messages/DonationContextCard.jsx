import { Link } from 'react-router-dom';
import { CalendarDays, MapPin, Package, UserRound } from 'lucide-react';
import { formatDate } from '../../utils/formatters';

function donationExpiration(context) {
  if (context.expirationAt) {
    const date = new Date(context.expirationAt);
    if (Number.isNaN(date.getTime())) return null;
    return new Intl.DateTimeFormat('en-PH', {
      timeZone: 'Asia/Manila',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }
  return context.expirationDate ? formatDate(context.expirationDate) : null;
}

export default function DonationContextCard({ context, showListingLink = true }) {
  if (!context) return null;

  const expiry = donationExpiration(context);
  const canViewListing = showListingLink && context.donationId && context.status === 'available';

  return (
    <section className="messages-product-context mx-4 mt-3 rounded-xl border border-[var(--line)] bg-[var(--soft)] p-3" aria-label="Donation context">
      <div className="messages-product-context-main">
        <div className="messages-product-context-product flex min-w-0 items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--panel)] text-[var(--green-700)]">
            {context.imageUrl ? <img src={context.imageUrl} alt="" className="h-full w-full object-cover" /> : <Package size={19} />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-[var(--text)]">{context.donationName || 'Donation listing'}</p>
            <p className="mt-0.5 truncate text-[13px] text-[var(--muted)]">Donation inquiry</p>
          </div>
        </div>

        <div className="messages-product-context-details min-w-0">
          <div className="flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
            <UserRound size={14} aria-hidden="true" />
            <span className="truncate">{context.farmerName || 'Donor'}</span>
          </div>
          {context.availableQuantity != null ? (
            <div className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--text)]">
              <Package size={14} aria-hidden="true" />
              <span>{context.availableQuantity} {context.unit || 'units'} available at inquiry</span>
            </div>
          ) : null}
          {context.location ? (
            <div className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
              <MapPin size={14} aria-hidden="true" />
              <span className="truncate">{context.location}</span>
            </div>
          ) : null}
          {expiry ? (
            <div className="mt-1 flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
              <CalendarDays size={14} aria-hidden="true" />
              <span>Available until {expiry}</span>
            </div>
          ) : null}
          {context.description ? <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--text-secondary)]">{context.description}</p> : null}
        </div>

        {canViewListing ? (
          <Link
            to={`/stakeholder-donations?donationId=${encodeURIComponent(context.donationId)}`}
            className="messages-product-context-link shrink-0 text-[12px] font-semibold text-[var(--green-700)] hover:underline"
          >
            View donation
          </Link>
        ) : null}
      </div>
    </section>
  );
}
