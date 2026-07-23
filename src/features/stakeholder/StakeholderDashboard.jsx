import { useEffect, useState } from 'react';
import { CalendarCheck, CheckCircle2, Gift, ListChecks } from 'lucide-react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import StatCard from '../../components/cards/StatCard';
import DonationCard from '../../components/cards/DonationCard';
import DataTable from '../../components/dashboard/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import EmptyState from '../../components/common/EmptyState';
import FarmerMap from '../../components/map/FarmerMap';
import DeliveryMap from '../../components/orders/DeliveryMap';
import { useAuth } from '../auth/AuthContext';
import { getBuyers, getStakeholders, getUserById, getVerifiedFarmers } from '../../services/authService';
import { getAvailableDonations, getDonationsForStakeholder } from '../../services/donationService';
import { getLiveTransitProgress, getOrdersByBuyer } from '../../services/orderService';
import { formatDate } from '../../utils/formatters';
import { nearestByMunicipality } from '../../utils/geo';
import { stakeholderNavItems } from './stakeholderNav';

// Donation farmer profiles are resolved from the real backend (donation records
// themselves still live in localStorage — see src/services/donationService.js — but the
// farmerId on each one is a real account, so its profile can still be looked up).
async function buildDonationFarmers(donations) {
  const farmerIds = [...new Set(donations.map((donation) => donation.farmerId))];
  const farmers = await Promise.all(farmerIds.map((id) => getUserById(id).catch(() => null)));
  const farmerById = new Map(farmers.filter(Boolean).map((farmer) => [farmer.id, farmer]));

  const byFarmerId = {};
  donations.forEach((donation) => {
    const farmer = farmerById.get(donation.farmerId);
    if (!farmer) return;
    if (!byFarmerId[donation.farmerId]) {
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

function buildActiveDeliveryRoutes(orders, currentUser) {
  return orders
    .filter((order) => order.status === 'confirmed')
    .map((order) => {
      const { progress, etaMinutes, currentPosition, remainingKm } = getLiveTransitProgress(order);
      const isPickup = order.deliveryMethod === 'buyer_pickup';
      return {
        id: order.id,
        // For pickup, the destination pin represents where you're starting from, not the
        // farm itself — the route shows how to get there, not a delivery on its way to you.
        originLabel: isPickup ? `${order.farmerName} (pickup here)` : `${order.farmerName} (farmer)`,
        destinationLabel: isPickup ? `${order.buyerName} (you, starting point)` : `${order.buyerName} (you)`,
        originMunicipality: order.originMunicipality,
        destinationMunicipality: isPickup ? currentUser.municipality : order.deliveryMunicipality,
        deliveryMethod: order.deliveryMethod,
        progress,
        etaMinutes,
        currentPosition,
        remainingKm,
        label: `${order.productName} — ${order.farmerName}`,
        href: `/orders/${order.id}`,
      };
    });
}

const EMPTY_STATE = {
  available: [], myRequests: [], donationFarmers: [], activeDeliveryRoutes: [],
  verifiedFarmers: [], buyers: [], stakeholders: [],
};

export default function StakeholderDashboard() {
  const { currentUser } = useAuth();
  const [state, setState] = useState(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;

    const reload = async () => {
      const available = getAvailableDonations();
      const myRequests = getDonationsForStakeholder(currentUser.id);
      const [donationFarmers, orders, verifiedFarmers, buyers, stakeholders] = await Promise.all([
        buildDonationFarmers(available),
        // Real marketplace purchases (not donation requests) — placed the same way a
        // buyer account would, so they're tracked the same way: by buyerId ownership.
        getOrdersByBuyer(currentUser.id),
        getVerifiedFarmers(),
        getBuyers(),
        getStakeholders(),
      ]);
      if (cancelled) return;

      setState({
        available,
        myRequests,
        donationFarmers,
        activeDeliveryRoutes: buildActiveDeliveryRoutes(orders, currentUser),
        verifiedFarmers,
        buyers,
        stakeholders: stakeholders.filter((stakeholder) => stakeholder.id !== currentUser.id),
      });
    };

    reload();
    const interval = setInterval(reload, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id, currentUser.municipality]);

  const { available, myRequests, donationFarmers, activeDeliveryRoutes, verifiedFarmers, buyers, stakeholders } = state;
  const scheduled = myRequests.filter((donation) => donation.status === 'scheduled');
  const completed = myRequests.filter((donation) => donation.status === 'completed');
  // The dashboard map is a small "who's nearby" widget, not the full directory.
  const nearbyFarmers = nearestByMunicipality(currentUser.municipality, verifiedFarmers);
  const nearbyBuyers = nearestByMunicipality(currentUser.municipality, buyers);
  const nearbyStakeholders = nearestByMunicipality(currentUser.municipality, stakeholders);

  return (
    <AppShell
      user={currentUser}
      navItems={stakeholderNavItems}
      title="Partner dashboard"
      subtitle="Browse surplus produce donations from Cebu farmers and track your pickup requests."
    >
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
              { key: 'updatedAt', label: 'Updated', render: (row) => <span className="muted">{formatDate(row.updatedAt)}</span> },
            ]}
            rows={myRequests.slice(0, 5)}
            emptyMessage="No donation requests yet."
          />
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Map</p>
            <h2>Active Users</h2>
            <p className="map-legend">
              <span className="legend-dot farmer" /> Registered farmer
              <span className="legend-dot buyer" /> Registered buyer
              <span className="legend-dot stakeholder" /> Registered stakeholder
            </p>
          </div>
          <span className="live-indicator"><span className="live-dot" /> Live</span>
        </div>
        <DeliveryMap
          routes={activeDeliveryRoutes}
          farmers={nearbyFarmers}
          buyers={nearbyBuyers}
          stakeholders={nearbyStakeholders}
          viewerMunicipality={currentUser.municipality}
        />
        {!activeDeliveryRoutes.length ? (
          <p className="muted map-empty-note">Confirmed marketplace orders will show up here with a live delivery route.</p>
        ) : null}
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
