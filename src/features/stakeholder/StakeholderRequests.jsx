import { useState } from 'react';
import { Calendar, CheckCircle2, History, Hourglass } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import DonationCard from '../../components/cards/DonationCard';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import StarRating from '../../components/common/StarRating';
import { useAuth } from '../auth/AuthContext';
import { confirmReceipt, markDonationRated } from '../../services/donationService';
import { createRating } from '../../services/ratingService';
import { useDonationList } from '../../hooks/useDonationList';
import { stakeholderNavItems } from './stakeholderNav';






function DonationRatingPrompt({ donation, onRated }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (donation.rated) {
    return <span className="rating-summary">Rated, thank you!</span>;
  }

  const handleRate = async (value) => {
    setIsSubmitting(true);
    setError('');
    try {
      await createRating({ farmerId: donation.farmerId, rating: value });
      await markDonationRated(donation.id);
      await onRated();
    } catch (rateError) {
      setError(rateError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <span className="rating-summary">
      <StarRating value={0} onChange={isSubmitting ? undefined : handleRate} size={18} />
      {error ? <small className="field-error">{error}</small> : 'Rate this farm'}
    </span>
  );
}

export default function StakeholderRequests() {
  const { currentUser } = useAuth();
  const { donations, loading, loadError, reload } = useDonationList({ stakeholderId: currentUser.id });
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = async (donation) => {
    if (confirming) return;
    setConfirming(true);
    try {
      await confirmReceipt(donation.id);
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

  const requested = donations.filter((donation) => donation.status === 'requested');
  const scheduled = donations.filter((donation) => donation.status === 'scheduled');
  const history = donations.filter((donation) => ['completed', 'cancelled'].includes(donation.status));

  return (
    <AppShell
      user={currentUser}
      navItems={stakeholderNavItems}
      title="My donation requests"
      subtitle="Track pickup schedules and confirm receipt once your organization collects the produce."
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
              {scheduled.map((donation) => (
                <DonationCard
                  key={donation.id}
                  donation={donation}
                  actions={(
                    <Button size="sm" disabled={confirming} onClick={() => handleConfirm(donation)}>
                      <CheckCircle2 size={15} /> Confirm receipt
                    </Button>
                  )}
                />
              ))}
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
                actions={donation.status === 'completed' ? <DonationRatingPrompt donation={donation} onRated={reload} /> : null}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            className="empty-state-transparent-icon"
            icon={History}
            title="No history yet"
            message="Completed and cancelled donation requests will be listed here."
          />
        )}
      </section>
    </AppShell>
  );
}
