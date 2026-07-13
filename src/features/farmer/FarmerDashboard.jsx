import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, Gift, Package, Store } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import StatCard from '../../components/cards/StatCard';
import DataTable from '../../components/dashboard/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import DeliveryMap from '../../components/orders/DeliveryMap';
import MarketPricePanel from '../../components/market/MarketPricePanel';
import { useAuth } from '../auth/AuthContext';
import { getBuyers, getUserById, getVerifiedFarmers } from '../../services/authService';
import { getProductsByFarmer } from '../../services/productService';
import { getLiveTransitProgress, getOrdersByFarmer } from '../../services/orderService';
import { getDonationsByFarmer } from '../../services/donationService';
import { matchCommodity } from '../../services/marketPriceService';
import { formatCurrency, formatDate, getFirstName } from '../../utils/formatters';
import { farmerNavItems } from './farmerNav';

const EMPTY_STATE = {
  products: [], orders: [], donations: [], otherFarmers: [], registeredBuyers: [], activeDeliveryRoutes: [],
};

export default function FarmerDashboard() {
  const { currentUser, acknowledgeVerification } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;

    const reload = async () => {
      const [products, orders, donations, verifiedFarmers, registeredBuyers] = await Promise.all([
        getProductsByFarmer(currentUser.id),
        getOrdersByFarmer(currentUser.id),
        getDonationsByFarmer(currentUser.id),
        getVerifiedFarmers(),
        getBuyers(),
      ]);
      if (cancelled) return;

      const confirmedOrders = orders.filter((order) => order.status === 'confirmed');
      // For pickup orders, the destination pin is where the BUYER starts from, not the
      // farm itself — that municipality lives on the buyer's own profile, not the order,
      // so pickup buyers need a separate lookup before the routes can be built.
      const pickupBuyerIds = [...new Set(confirmedOrders.filter((o) => o.deliveryMethod === 'buyer_pickup').map((o) => o.buyerId))];
      const pickupBuyers = await Promise.all(pickupBuyerIds.map((id) => getUserById(id).catch(() => null)));
      if (cancelled) return;
      const municipalityByBuyerId = new Map(pickupBuyers.filter(Boolean).map((buyer) => [buyer.id, buyer.municipality]));

      const activeDeliveryRoutes = confirmedOrders.map((order) => {
        const { progress, etaMinutes } = getLiveTransitProgress(order);
        const isPickup = order.deliveryMethod === 'buyer_pickup';
        const buyerMunicipality = isPickup ? (municipalityByBuyerId.get(order.buyerId) || order.deliveryMunicipality) : order.deliveryMunicipality;
        return {
          id: order.id,
          originLabel: isPickup ? `${order.farmerName} (you, pickup here)` : `${order.farmerName} (you)`,
          destinationLabel: isPickup ? `${order.buyerName} (starting point)` : `${order.buyerName} (buyer)`,
          originMunicipality: order.originMunicipality,
          destinationMunicipality: buyerMunicipality,
          deliveryMethod: order.deliveryMethod,
          progress,
          etaMinutes,
          label: `${order.productName} — ${order.buyerName}`,
          href: `/orders/${order.id}`,
        };
      });

      setState({
        products,
        orders,
        donations,
        otherFarmers: verifiedFarmers.filter((farmer) => farmer.id !== currentUser.id),
        registeredBuyers,
        activeDeliveryRoutes,
      });
    };

    reload();
    const interval = setInterval(reload, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser.id]);

  const { products, orders, donations, otherFarmers, registeredBuyers, activeDeliveryRoutes } = state;
  const pendingOrders = orders.filter((order) => order.status === 'pending');
  const confirmedOrders = orders.filter((order) => order.status === 'confirmed');
  const pendingDonationRequests = donations.filter((donation) => donation.status === 'requested');

  const matchedCommodity = products.map((product) => matchCommodity(product.name)).find(Boolean);
  const marketCommodityId = matchedCommodity?.id || '28';

  return (
    <AppShell
      user={currentUser}
      navItems={farmerNavItems}
      title={`Welcome, ${getFirstName(currentUser.name)}!`}
      subtitle="Manage your harvest listings, orders, and surplus donations from one workspace."
    >
      {currentUser.verificationStatus === 'verified' && currentUser.verificationAcknowledged === false ? (
        <div className="form-alert success">
          <strong>Your account has been approved by admin!</strong>
          <p>You can now add products to the marketplace.</p>
          <Button size="sm" variant="secondary" onClick={acknowledgeVerification}>Got it</Button>
        </div>
      ) : currentUser.verificationStatus === 'pending' ? (
        <div className="form-alert warning">
          <strong>Your account is pending verification.</strong>
          <p>An admin typically reviews and approves new accounts within 24 hours. You can explore your dashboard in the meantime, but adding products is unlocked once your account is verified.</p>
        </div>
      ) : currentUser.verificationStatus === 'rejected' ? (
        <div className="form-alert error">
          <strong>Your account verification was declined.</strong>
          <p>You can&apos;t add products until an admin approves your account. Update your profile details and contact support if you believe this was a mistake.</p>
        </div>
      ) : null}

      <section className="stats-grid">
        <StatCard label="Total products" value={products.length} icon={<Store size={20} />} />
        <StatCard label="Active listings" value={products.filter((product) => product.status === 'active').length} icon={<Package size={20} />} />
        <StatCard label="Pending orders" value={pendingOrders.length} icon={<Clock3 size={20} />} />
        <StatCard label="Confirmed orders" value={confirmedOrders.length} icon={<CheckCircle2 size={20} />} />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Map</p>
            <h2>Active deliveries</h2>
            <p className="map-legend">
              <span className="legend-dot origin" /> Farmer/pickup
              <span className="legend-dot destination" /> Delivery to buyer
              <span className="legend-dot farmer" /> Other farmers
              <span className="legend-dot destination" /> Registered buyers
            </p>
          </div>
          <span className="live-indicator"><span className="live-dot" /> Live</span>
        </div>
        <DeliveryMap routes={activeDeliveryRoutes} farmers={otherFarmers} buyers={registeredBuyers} alertStyle />
      </section>

      <MarketPricePanel commodityId={marketCommodityId} perspective="farmer" />

      <section className="content-grid two">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Products</p>
              <h2>Recent listings</h2>
            </div>
            <Link className="btn btn-secondary btn-md" to="/farmer-products">Manage products</Link>
          </div>
          {products.length ? (
            <DataTable
              columns={[
                { key: 'name', label: 'Product' },
                { key: 'quantity', label: 'Available', render: (row) => `${row.quantity} ${row.unit}` },
                { key: 'price', label: 'Price', render: (row) => `${formatCurrency(row.price)} / ${row.unit}` },
                { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
              ]}
              rows={products.slice(0, 5)}
              emptyMessage="No products yet."
            />
          ) : (
            <EmptyState title="No products yet" message="Add your first harvest listing so buyers can discover it." actionLabel="Add product" onAction={() => navigate('/farmer-products')} />
          )}
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Orders</p>
              <h2>Latest buyer activity</h2>
            </div>
            <Link className="btn btn-secondary btn-md" to="/farmer-orders">Review all</Link>
          </div>
          <DataTable
            columns={[
              { key: 'buyerName', label: 'Buyer' },
              { key: 'productName', label: 'Product' },
              { key: 'paymentMethod', label: 'Payment', render: (row) => <StatusBadge value={row.paymentMethod} type="payment" /> },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
              { key: 'createdAt', label: 'Date', render: (row) => formatDate(row.createdAt) },
            ]}
            rows={orders.slice(0, 5)}
            emptyMessage="No buyer orders yet."
          />
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Surplus</p>
            <h2>Donations needing a response</h2>
          </div>
          <Link className="btn btn-secondary btn-md" to="/farmer-donations">
            <Gift size={16} /> Manage donations
          </Link>
        </div>
        {pendingDonationRequests.length ? (
          <DataTable
            columns={[
              { key: 'productName', label: 'Product' },
              { key: 'quantity', label: 'Quantity', render: (row) => `${row.quantity} ${row.unit}` },
              { key: 'requestedByName', label: 'Requested by' },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} type="donation" /> },
            ]}
            rows={pendingDonationRequests}
            emptyMessage="No pending donation requests."
          />
        ) : (
          <EmptyState title="No pending donation requests" message="Donate unsold stock so partner organizations can request it." />
        )}
      </section>

      <div className="quick-actions">
        <Button onClick={() => navigate('/farmer-products')}>Add a product</Button>
        <Link className="btn btn-secondary btn-md" to="/marketplace">View marketplace</Link>
      </div>
    </AppShell>
  );
}
