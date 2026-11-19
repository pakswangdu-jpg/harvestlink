import { useRef, useState } from 'react';
import { Calendar, CheckCircle2, History, Hourglass } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import DonationCard from '../../components/cards/DonationCard';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import StarRating from '../../components/common/StarRating';
import RequiredFeedbackDialog from '../../components/common/RequiredFeedbackDialog';
import { useAuth } from '../auth/AuthContext';
import {
  confirmReceipt,
  markDonationClaimRated,
  markDonationRated,
  receiveDonationClaim,
} from '../../services/donationService';
import { createRating } from '../../services/ratingService';
import { useDonationList } from '../../hooks/useDonationList';
import { stakeholderNavItems } from './stakeholderNav';
import { stakeholderPickupDisplayStatus } from './dashboardPresentation';

function DonationRatingPrompt({ donation, onRated }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [ratingCreated, setRatingCreated] = useState(false);
  const savingRef = useRef(false);

  const handleRate = async () => {
    if (!rating || savingRef.current) return;
    savingRef.current = true;
    setIsSubmitting(true);
    setError('');
    try {
      if (!ratingCreated) {
        await createRating({
          farmerId: donation.farmerId,
          productId: donation.productId,
          donationId: donation.id,
          claimId: donation.myClaim?.id,
          rating,
          comment,
        });
        setRatingCreated(true);
      }
      if (donation.myClaim?.id) await markDonationClaimRated(donation.myClaim.id);
      else await markDonationRated(donation.id);
    } catch (rateError) {
      setError(rateError.message);
      return;
    } finally {
      savingRef.current = false;
      setIsSubmitting(false);
    }
    onRated();
  };

  return (
    <RequiredFeedbackDialog title={`Rate ${donation.farmerName}`}>
      <div className="form-stack" aria-busy={isSubmitting}>
        <p>{donation.productName}</p>
        {error ? <div className="form-alert error" role="alert">{error}</div> : null}
        <StarRating value={rating} onChange={isSubmitting || ratingCreated ? undefined : setRating} size={26} />
        <textarea
          rows={3}
          aria-label="Optional donation feedback"
          placeholder="How was the donation? (Optional)"
          value={comment}
          disabled={isSubmitting || ratingCreated}
          onChange={(event) => setComment(event.target.value)}
        />
        <Button disabled={!rating || isSubmitting} onClick={handleRate}>
          {isSubmitting ? 'Submitting…' : 'Submit rating'}
        </Button>
      </div>
    </RequiredFeedbackDialog>
  );
}

export default function StakeholderRequests() {
  const { currentUser } = useAuth();
  const { donations, loading, loadError, reload } = useDonationList({ stakeholderId: currentUser.id });
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [submittedReviews, setSubmittedReviews] = useState({});

  const openLiveTrackingPopup = (donation) => {
    const targetId = donation?.myClaim?.id || donation?.id;
    if (typeof window !== 'undefined' && targetId) {
      window.dispatchEvent(
        new CustomEvent('harvestlink:open-donation-tracking', {
          detail: { targetId },
        }),
      );
    }
  };

  const handleConfirm = async (donation) => {
    const activePickupStatus = donation?.myClaim?.pickupStatus || donation?.pickupStatus;
    if (activePickupStatus && activePickupStatus !== 'none') {
      openLiveTrackingPopup(donation);
      return;
    }
    if (confirming) return;
    setConfirming(true);
    try {
      if (donation.myClaim) await receiveDonationClaim(donation.myClaim.id);
      else await confirmReceipt(donation.id);
      setError('');
      setNotice(`${donation.productName} marked as received. Thank you!`);
      await reload();
    } catch (confirmError) {
      setNotice('');
      setError(confirmError.message);
    } finally {
      setConfirming(false);
    }
  };

  const claimStatus = (donation) => donation.myClaim?.status;
  const requested = donations.filter((donation) => donation.status === 'requested' || claimStatus(donation) === 'pending');
  const scheduled = donations.filter((donation) => donation.status === 'scheduled' || claimStatus(donation) === 'scheduled');
  const history = donations.filter((donation) => ['completed', 'cancelled', 'expired'].includes(donation.status)
    || ['completed', 'cancelled', 'rejected', 'expired'].includes(claimStatus(donation)));
  const reviewKey = (donation) => donation.myClaim?.id || donation.id;
  const isRated = (donation) => (donation.myClaim ? donation.myClaim.rated : donation.rated) || submittedReviews[reviewKey(donation)];
  const pendingReview = history.find((donation) => donation.productId && !isRated(donation)
    && (donation.myClaim
      ? donation.myClaim.status === 'completed'
      : donation.status === 'completed' && donation.requestedById === currentUser.id));

  return (
    <AppShell
      user={currentUser}
      navItems={stakeholderNavItems}
      title="My donation requests"
      subtitle="Track live pickup routes to the farm and view farmer handover confirmation."
    >
      {notice ? <div className="form-alert success">{notice}</div> : null}
      {error ? <div className="form-alert error">{error}</div> : null}
      {loadError ? <div className="form-alert error" role="alert">{loadError}</div> : null}
      {loading ? <p role="status">Loading donation requests...</p> : null}

      <section className="content-grid two">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Awaiting farmer</p>
              <h2>Pending requests</h2>
            </div>
          </div>
          {requested.length ? (
            <div className="product-grid compact">
              {requested.map((donation) => <DonationCard key={donation.id} donation={donation} />)}
            </div>
          ) : (
            <EmptyState icon={Hourglass} className="empty-state-amber empty-state-transparent-icon empty-state-waiting" title="No pending requests" message="Requests you send will appear here until the farmer responds." />
          )}
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Pickup</p>
              <h2>Scheduled pickups</h2>
            </div>
          </div>
          {scheduled.length ? (
            <div className="product-grid compact">
              {scheduled.map((donation) => {
                const hasTrackedPickup = Boolean(donation?.myClaim?.pickupStatus || donation?.pickupStatus);
                return (
                  <DonationCard
                    key={donation.id}
                    donation={donation}
                    statusValue={stakeholderPickupDisplayStatus(donation)}
                    actions={(
                      <Button
                        size="sm"
                        className="stakeholder-pickup-action"
                        disabled={confirming}
                        onClick={() => handleConfirm(donation)}
                      >
                        {hasTrackedPickup ? (
                          <>
                            <span className="live-dot" aria-hidden="true" style={{ width: '8px', height: '8px', display: 'inline-block', marginRight: '6px' }} />
                            Live Pickup Tracking
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={15} /> Confirm receipt
                          </>
                        )}
                      </Button>
                    )}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState className="empty-state-transparent-icon" icon={Calendar} title="Nothing scheduled" message="Accepted requests with a pickup date will appear here." />
          )}
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">History</p>
            <h2>Completed & cancelled</h2>
          </div>
        </div>
        {history.length ? (
          <div className="product-grid compact">
            {history.map((donation) => (
              <DonationCard
                key={donation.id}
                donation={donation}
                actions={isRated(donation) ? <span className="rating-summary">Rated, thank you!</span> : null}
              />
            ))}
          </div>
        ) : (
          <EmptyState className="empty-state-transparent-icon" icon={History} title="No history yet" message="Completed and cancelled donation requests will be listed here." />
        )}
      </section>
      {pendingReview ? (
        <DonationRatingPrompt
          key={reviewKey(pendingReview)}
          donation={pendingReview}
          onRated={() => {
            setSubmittedReviews((reviews) => ({ ...reviews, [reviewKey(pendingReview)]: true }));
            void reload();
          }}
        />
      ) : null}
    </AppShell>
  );
}
