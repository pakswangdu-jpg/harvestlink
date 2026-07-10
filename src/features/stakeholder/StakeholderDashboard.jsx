import { CalendarCheck, CheckCircle2, Gift, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import StatCard from '../../components/cards/StatCard';
import DonationCard from '../../components/cards/DonationCard';
import DataTable from '../../components/dashboard/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import FarmerMap from '../../components/map/FarmerMap';
import { useAuth } from '../auth/AuthContext';
import { getUserById } from '../../services/authService';
import { getAvailableDonations, getDonationsForStakeholder } from '../../services/donationService';
import { formatDate } from '../../utils/formatters';
import { stakeholderNavItems } from './stakeholderNav';

function buildDonationFarmers(donations) {
  const byFarmerId = {};
  donations.forEach((donation) => {
    if (!byFarmerId[donation.farmerId]) {
      const farmer = getUserById(donation.farmerId);
      if (!farmer) return;
      byFarmerId[donation.farmerId] = {
        id: farmer.id,
        name: farmer.name,
        farmName: farmer.farmName,
        municipality: farmer.municipality,
        address: farmer.address,
        contactNumber: farmer.contactNumber,
        donations: [],
      };
    }
    byFarmerId[donation.farmerId].donations.push({
      productName: donation.productName,
      quantity: donation.quantity,
      unit: donation.unit,
    });
  });
  return Object.values(byFarmerId);
}

export default function StakeholderDashboard() {
  const { currentUser, acknowledgeVerification } = useAuth();
  const available = getAvailableDonations();
  const myRequests = getDonationsForStakeholder(currentUser.id);
  const scheduled = myRequests.filter((donation) => donation.status === 'scheduled');
  const completed = myRequests.filter((donation) => donation.status === 'completed');
  const donationFarmers = buildDonationFarmers(available);

  return (
    <AppShell
      user={currentUser}
      navItems={stakeholderNavItems}
      title="Partner dashboard"
      subtitle="Browse surplus produce donations from Cebu farmers and track your pickup requests."
    >
      {currentUser.verificationStatus === 'verified' && currentUser.verificationAcknowledged === false ? (
        <div className="form-alert success">
          <strong>Your organization has been approved by admin!</strong>
          <p>You can now browse and request surplus donations.</p>
          <Button size="sm" variant="secondary" onClick={acknowledgeVerification}>Got it</Button>
        </div>
      ) : currentUser.verificationStatus === 'pending' ? (
        <div className="form-alert warning">
          <strong>Your organization's account is pending verification.</strong>
          <p>An admin typically reviews and approves new accounts within 24 hours. You can explore your dashboard in the meantime, but requesting donations is unlocked once your account is verified.</p>
        </div>
      ) : currentUser.verificationStatus === 'rejected' ? (
        <div className="form-alert error">
          <strong>Your organization's verification was declined.</strong>
          <p>You can&apos;t request donations until an admin approves your account. Update your profile details and contact support if you believe this was a mistake.</p>
        </div>
      ) : null}

      <section className="stats-grid">
        <StatCard label="Available donations" value={available.length} icon={<Gift size={20} />} />
        <StatCard label="My requests" value={myRequests.length} icon={<ListChecks size={20} />} />
        <StatCard label="Scheduled pickups" value={scheduled.length} icon={<CalendarCheck size={20} />} />
        <StatCard label="Completed" value={completed.length} icon={<CheckCircle2 size={20} />} />
      </section>

      <section className="content-grid two">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Surplus produce</p>
              <h2>Available donations</h2>
            </div>
            <Link className="btn btn-secondary btn-md" to="/stakeholder-donations">Browse all</Link>
          </div>
          {available.length ? (
            <div className="product-grid preview">
              {available.slice(0, 4).map((donation) => <DonationCard key={donation.id} donation={donation} />)}
            </div>
          ) : (
            <EmptyState title="No donations yet" message="Available surplus produce will appear here." />
          )}
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">History</p>
              <h2>Recent requests</h2>
            </div>
            <Link className="btn btn-secondary btn-md" to="/stakeholder-requests">View all</Link>
          </div>
          <DataTable
            columns={[
              { key: 'productName', label: 'Product' },
              { key: 'farmerName', label: 'Farmer' },
              { key: 'quantity', label: 'Qty', render: (row) => `${row.quantity} ${row.unit}` },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} type="donation" /> },
              { key: 'updatedAt', label: 'Updated', render: (row) => formatDate(row.updatedAt) },
            ]}
            rows={myRequests.slice(0, 5)}
            emptyMessage="No donation requests yet."
          />
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Surplus produce</p>
            <h2>Donation map</h2>
          </div>
        </div>
        <p className="map-legend">
          <span className="legend-dot donation" /> Farmer with available donations
        </p>
        <FarmerMap farmers={[]} donationFarmers={donationFarmers} />
        {!donationFarmers.length ? (
          <p className="muted map-empty-note">No surplus produce is available right now — this map updates the moment a farmer donates.</p>
        ) : null}
      </section>
    </AppShell>
  );
}
