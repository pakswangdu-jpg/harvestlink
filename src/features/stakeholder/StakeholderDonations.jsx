import { useEffect, useState } from 'react';
import { Gift, MessageCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import DonationCard from '../../components/cards/DonationCard';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import { useAuth } from '../auth/AuthContext';
import { requestDonation } from '../../services/donationService';
import { useDonationList } from '../../hooks/useDonationList';
import { stakeholderNavItems } from './stakeholderNav';

const DONATION_MESSAGE_SUGGESTIONS = [
  'Hi! Is this donation still available?',
  'We are interested in claiming this donation.',
  'Is the available quantity still accurate?',
  'Can we claim only a portion of the quantity?',
  'What is the pickup location?',
  'Can we arrange a pickup schedule?',
];

function quantityLabel(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  const rounded = Math.round(number * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function MessageFarmerLink({ donation, canMessage }) {
  if (!canMessage || !donation.farmerId) return null;
  return (
    <Link
      to={`/messages/direct/${donation.farmerId}`}
      state={{
        donationContext: {
          donationId: donation.id,
          donationName: donation.productName,
          imageUrl: donation.image,
          description: donation.description,
          expirationAt: donation.expirationAt,
          expirationDate: donation.expirationDate,
          location: donation.location,
          farmerId: donation.farmerId,
          farmerName: donation.farmerName,
          availableQuantity: Number(donation.availableQuantity ?? donation.quantity),
          status: donation.status,
          unit: donation.unit,
        },
        initialMessage: '',
        suggestedMessages: DONATION_MESSAGE_SUGGESTIONS,
      }}
      className="donation-message-action"
      aria-label={`Message ${donation.farmerName || 'farmer'} about ${donation.productName}`}
    >
      <MessageCircle size={15} aria-hidden="true" />
      Message farmer
    </Link>
  );
}

export default function StakeholderDonations() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const { donations, loading, loadError, reload } = useDonationList({ availableOnly: true });
  const [requesting, setRequesting] = useState(false);
  const [notice, setNotice] = useState('');
  const [requestErrors, setRequestErrors] = useState({});
  const [claimQuantities, setClaimQuantities] = useState({});

  const canRequestDonations = currentUser.verificationStatus === 'verified';
  const requestedDonationId = new URLSearchParams(location.search).get('donationId');
  const setRequestError = (donationId, message) => setRequestErrors((previous) => ({
    ...previous,
    [donationId]: message,
  }));
  const clearRequestError = (donationId) => setRequestErrors((previous) => {
    if (!previous[donationId]) return previous;
    const next = { ...previous };
    delete next[donationId];
    return next;
  });

  useEffect(() => {
    if (!requestedDonationId || loading) return;
    document.getElementById(`donation-${requestedDonationId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [requestedDonationId, loading, donations]);

  const handleRequest = async (donation) => {
    if (requesting) return;
    const rawAvailable = donation.availableQuantity ?? donation.quantity;
    const available = Number(rawAvailable);
    const enteredQuantity = claimQuantities[donation.id];
    if (enteredQuantity == null || String(enteredQuantity).trim() === '') {
      setRequestError(donation.id, 'Enter the amount you need before requesting this donation.');
      return;
    }
    const quantity = Number(enteredQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setRequestError(donation.id, 'Enter a quantity greater than 0.');
      return;
    }
    if (!Number.isFinite(available) || available <= 0) {
      setRequestError(donation.id, 'No stock is currently available. Refresh the page to check again.');
      return;
    }
    if (quantity > available) {
      setRequestError(donation.id, `Only ${quantityLabel(rawAvailable)} ${donation.unit} is available.`);
      return;
    }
    setRequesting(true);
    try {
      await requestDonation(donation.id, quantity);
      clearRequestError(donation.id);
      setNotice(`Request sent to ${donation.farmerName} for ${quantityLabel(quantity)} ${donation.unit} of ${donation.productName}.`);
      await reload();
    } catch (requestError) {
      setNotice('');
      setRequestError(donation.id, requestError.message);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <AppShell
      user={currentUser}
      navItems={stakeholderNavItems}
      title="Browse donations"
      subtitle="Request surplus produce from Cebu farmers for your organization."
    >
      {!canRequestDonations ? (
        <div className={`form-alert ${currentUser.verificationStatus === 'rejected' ? 'error' : 'warning'}`}>
          {currentUser.verificationStatus === 'rejected' ? (
            <>
              <strong>Your organization verification was declined.</strong>
              <p>You can&apos;t request donations until an admin approves your account. Update your profile details and contact support if you believe this was a mistake.</p>
            </>
          ) : (
            <>
              <strong>Your organization is pending verification.</strong>
              <p>Requesting donations is unlocked once an admin approves your account.</p>
            </>
          )}
        </div>
      ) : null}

      {notice ? <div className="form-alert success">{notice}</div> : null}
      {loadError ? <div className="form-alert error" role="alert">{loadError}</div> : null}

      {loading ? <p role="status">Loading donations...</p> : donations.length ? (
        <section className="product-grid">
          {donations.map((donation) => (
            <DonationCard
              key={donation.id}
              donation={donation}
              variant="discovery"
              actions={(
                donation.myClaim && ['pending', 'scheduled'].includes(donation.myClaim.status) ? (
                  <div className="donation-request-status">
                    <span>Claim {quantityLabel(donation.myClaim.quantity)} {donation.unit}: {donation.myClaim.status}</span>
                    <MessageFarmerLink donation={donation} canMessage={canRequestDonations} />
                  </div>
                ) : (
                  <div
                    className="donation-request-controls"
                    onClick={(event) => {
                      if (!event || event.target === event.currentTarget) return handleRequest(donation);
                      return undefined;
                    }}
                  >
                    <div className="donation-request-quantity">
                      <label htmlFor={`donation-quantity-${donation.id}`}>How much do you need?</label>
                      <div className="donation-request-quantity-input">
                        <input
                          id={`donation-quantity-${donation.id}`}
                          type="number"
                          min="0.01"
                          max={donation.availableQuantity ?? donation.quantity}
                          step="0.01"
                          required
                          value={claimQuantities[donation.id] ?? ''}
                          onChange={(event) => {
                            setClaimQuantities((previous) => ({ ...previous, [donation.id]: event.target.value }));
                            clearRequestError(donation.id);
                          }}
                          aria-invalid={Boolean(requestErrors[donation.id])}
                          aria-describedby={`donation-quantity-help-${donation.id}${requestErrors[donation.id] ? ` donation-quantity-error-${donation.id}` : ''}`}
                        />
                        <span>{donation.unit}</span>
                      </div>
                      <small id={`donation-quantity-help-${donation.id}`}>
                        {quantityLabel(donation.availableQuantity ?? donation.quantity)} {donation.unit} available
                      </small>
                      {requestErrors[donation.id] ? (
                        <p id={`donation-quantity-error-${donation.id}`} className="mt-1 text-[12px] leading-4 text-[var(--red-700)]" role="alert">
                          {requestErrors[donation.id]}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleRequest(donation)}
                      disabled={!canRequestDonations || requesting}
                      title={canRequestDonations ? undefined : 'Verify your account before requesting donations.'}
                    >
                      <Gift size={15} /> Request this amount
                    </Button>
                    <MessageFarmerLink donation={donation} canMessage={canRequestDonations} />
                  </div>
                )
              )}
            />
          ))}
        </section>
      ) : (
        <EmptyState className="empty-state-transparent-icon" title="No donations available" message="Check back when farmers list surplus produce for donation." />
      )}
    </AppShell>
  );
}
