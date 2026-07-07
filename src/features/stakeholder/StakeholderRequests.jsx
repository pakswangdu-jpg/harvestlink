import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import DonationCard from '../../components/cards/DonationCard';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import { useAuth } from '../auth/AuthContext';
import { confirmReceipt, getDonationsForStakeholder } from '../../services/donationService';
import { STORAGE_KEYS } from '../../utils/constants';
import { stakeholderNavItems } from './stakeholderNav';

export default function StakeholderRequests() {
  const { currentUser } = useAuth();
  const [donations, setDonations] = useState(() => getDonationsForStakeholder(currentUser.id));
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const reload = () => setDonations(getDonationsForStakeholder(currentUser.id));

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const handleConfirm = (donation) => {
    try {
      confirmReceipt(donation.id);
      setError('');
      setNotice(`${donation.productName} marked as received. Thank you!`);
      reload();
    } catch (confirmError) {
      setNotice('');
      setError(confirmError.message);
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
            <EmptyState title="No pending requests" message="Requests you send will appear here until the farmer responds." />
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
                    <Button size="sm" onClick={() => handleConfirm(donation)}>
                      <CheckCircle2 size={15} /> Confirm receipt
                    </Button>
                  )}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="Nothing scheduled" message="Accepted requests with a pickup date will appear here." />
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
            {history.map((donation) => <DonationCard key={donation.id} donation={donation} />)}
          </div>
        ) : (
          <EmptyState title="No history yet" message="Completed and cancelled donation requests will be listed here." />
        )}
      </section>
    </AppShell>
  );
}
