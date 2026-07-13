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
      {notice ? <div className="form-alert success">{notice}</div> : null}
      {error ? <div className="form-alert error">{error}</div> : null}

      {donations.length ? (
        <section className="product-grid">
          {donations.map((donation) => (
            <DonationCard
              key={donation.id}
              donation={donation}
              actions={(
                <Button size="sm" onClick={() => handleRequest(donation)}>
                  <Gift size={15} /> Request donation
                </Button>
              )}
            />
          ))}
        </section>
      ) : (
        <EmptyState title="No donations available" message="Check back when farmers list surplus produce for donation." />
      )}
    </AppShell>
  );
}
