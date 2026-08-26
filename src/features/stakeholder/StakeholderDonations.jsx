import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import DonationCard from '../../components/cards/DonationCard';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import { useAuth } from '../auth/AuthContext';
import { getAvailableDonations, requestDonation } from '../../services/donationService';
import { STORAGE_KEYS } from '../../utils/constants';
import { stakeholderNavItems } from './stakeholderNav';

export default function StakeholderDonations() {
  const { currentUser } = useAuth();
  const [donations, setDonations] = useState(() => getAvailableDonations());
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const canRequestDonations = currentUser.verificationStatus === 'verified';

  const reload = () => setDonations(getAvailableDonations());

  useEffect(() => {
    const handleStorage = (event) => {
      if (!event.key || event.key === STORAGE_KEYS.donations) reload();
    };
    const interval = setInterval(reload, 4000);
    window.addEventListener('storage', handleStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const handleRequest = (donation) => {
    try {
      requestDonation(donation.id, currentUser);
      setError('');
      setNotice(`Request sent to ${donation.farmerName} for ${donation.productName}.`);
      reload();
    } catch (requestError) {
      setNotice('');
      setError(requestError.message);
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

      {donations.length ? (
        <section className="product-grid">
          {donations.map((donation) => (
            <DonationCard
              key={donation.id}
              donation={donation}
              actions={(
                <Button
                  size="sm"
                  onClick={() => handleRequest(donation)}
                  disabled={!canRequestDonations}
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
