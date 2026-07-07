import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import DonationCard from '../../components/cards/DonationCard';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import { useAuth } from '../auth/AuthContext';
import {
  acceptDonationRequest,
  cancelDonation,
  declineDonationRequest,
  getDonationsByFarmer,
} from '../../services/donationService';
import { STORAGE_KEYS } from '../../utils/constants';
import { farmerNavItems } from './farmerNav';

export default function FarmerDonations() {
  const { currentUser } = useAuth();
  const [donations, setDonations] = useState(() => getDonationsByFarmer(currentUser.id));
  const [pickupDrafts, setPickupDrafts] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const reload = () => setDonations(getDonationsByFarmer(currentUser.id));

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

  const run = (action, successMessage) => {
    try {
      action();
      setError('');
      setNotice(successMessage);
      reload();
    } catch (actionError) {
      setNotice('');
      setError(actionError.message);
    }
  };

  const requested = donations.filter((donation) => donation.status === 'requested');
  const scheduled = donations.filter((donation) => donation.status === 'scheduled');
  const available = donations.filter((donation) => donation.status === 'available');
  const history = donations.filter((donation) => ['completed', 'cancelled'].includes(donation.status));

  return (
    <AppShell
      user={currentUser}
      navItems={farmerNavItems}
      title="Surplus donations"
      subtitle="Manage donation offers, respond to partner organization requests, and track pickups."
    >
      {notice ? <div className="form-alert success">{notice}</div> : null}
      {error ? <div className="form-alert error">{error}</div> : null}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Action needed</p>
            <h2>Incoming requests</h2>
          </div>
        </div>
        {requested.length ? (
          <div className="product-grid compact">
            {requested.map((donation) => (
              <DonationCard
                key={donation.id}
                donation={donation}
                actions={(
                  <div className="card-actions surplus-actions">
                    <input
                      type="date"
                      value={pickupDrafts[donation.id] || ''}
                      onChange={(event) => setPickupDrafts((previous) => ({ ...previous, [donation.id]: event.target.value }))}
                    />
                    <Button
                      size="sm"
                      onClick={() => run(() => acceptDonationRequest(donation.id, pickupDrafts[donation.id]), 'Pickup scheduled.')}
                    >
                      <Check size={15} /> Accept
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => run(() => declineDonationRequest(donation.id), 'Request declined.')}>
                      <X size={15} /> Decline
                    </Button>
                  </div>
                )}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No pending requests" message="Requests from partner organizations will appear here." />
        )}
      </section>

      <section className="content-grid two">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Upcoming</p>
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
                    <Button size="sm" variant="ghost" onClick={() => run(() => cancelDonation(donation.id), 'Donation cancelled.')}>
                      Cancel
                    </Button>
                  )}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No scheduled pickups" message="Accepted donation requests will show their pickup date here." />
          )}
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Waiting</p>
              <h2>Available offers</h2>
            </div>
          </div>
          {available.length ? (
            <div className="product-grid compact">
              {available.map((donation) => (
                <DonationCard
                  key={donation.id}
                  donation={donation}
                  actions={(
                    <Button size="sm" variant="ghost" onClick={() => run(() => cancelDonation(donation.id), 'Donation withdrawn.')}>
                      Withdraw
                    </Button>
                  )}
                />
              ))}
            </div>
          ) : (
            <EmptyState title="No open offers" message="Donate remaining stock from your product listings to see it here." />
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
          <EmptyState title="No donation history yet" message="Completed and cancelled donations will be listed here." />
        )}
      </section>
    </AppShell>
  );
}
