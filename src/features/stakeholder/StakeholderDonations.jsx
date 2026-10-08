import { useState } from 'react';
import { Gift } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import DonationCard from '../../components/cards/DonationCard';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import { useAuth } from '../auth/AuthContext';
import { requestDonation } from '../../services/donationService';
import { useDonationList } from '../../hooks/useDonationList';
import { stakeholderNavItems } from './stakeholderNav';

export default function StakeholderDonations() {
  const { currentUser } = useAuth();
  const { donations, loading, loadError, reload } = useDonationList({ availableOnly: true });
  const [requesting, setRequesting] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const canRequestDonations = currentUser.verificationStatus === 'verified';

  const handleRequest = async (donation) => {
    if (requesting) return;
    setRequesting(true);
    try {
      await requestDonation(donation.id);
      setError('');
      setNotice(`Request sent to ${donation.farmerName} for ${donation.productName}.`);
      await reload();
    } catch (requestError) {
      setNotice('');
      setError(requestError.message);
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
      {error ? <div className="form-alert error">{error}</div> : null}
      {loadError ? <div className="form-alert error" role="alert">{loadError}</div> : null}

      {loading ? <p role="status">Loading donations...</p> : donations.length ? (
        <section className="product-grid">
          {donations.map((donation) => (
            <DonationCard
              key={donation.id}
              donation={donation}
              actions={(
                <Button
                  size="sm"
                  onClick={() => handleRequest(donation)}
                  disabled={!canRequestDonations || requesting}
                  title={canRequestDonations ? undefined : 'Verify your account before requesting donations.'}
                >
                  <Gift size={15} /> Request donation
                </Button>
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
