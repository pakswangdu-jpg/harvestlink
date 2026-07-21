import { useEffect, useState } from 'react';
import { Clock3, MapPin, PackageCheck, ShoppingBag, Store, Wallet } from 'lucide-react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import StatCard from '../../components/cards/StatCard';
import ProductCard from '../../components/cards/ProductCard';
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/dashboard/DataTable';
import EmptyState from '../../components/common/EmptyState';
import StarRating from '../../components/common/StarRating';
import DeliveryMap from '../../components/orders/DeliveryMap';
import MarketPricePanel from '../../components/market/MarketPricePanel';
import { useAuth } from '../auth/AuthContext';
import { getBuyers, getStakeholders, getVerifiedFarmers } from '../../services/authService';
import { getActiveProducts } from '../../services/productService';
import { getLiveTransitProgress, getOrdersByBuyer } from '../../services/orderService';
import { matchCommodity } from '../../services/marketPriceService';
import { getTotalRevenue } from '../../services/reportService';
import { formatCurrency, formatDate, getFirstName, getInitials } from '../../utils/formatters';
import { nearestByMunicipality } from '../../utils/geo';
import { buyerNavItems } from './buyerNav';

const EMPTY_STATE = {
  products: [], orders: [], verifiedFarmers: [], registeredBuyers: [], registeredStakeholders: [], activeDeliveryRoutes: [],
};

export default function BuyerDashboard() {
  const { currentUser } = useAuth();
  const [state, setState] = useState(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;

    const reload = async () => {
      const [products, orders, verifiedFarmers, buyers, stakeholders] = await Promise.all([
        getActiveProducts(),
        getOrdersByBuyer(currentUser.id),
        getVerifiedFarmers(),
        getBuyers(),
        getStakeholders(),
      ]);
      if (cancelled) return;

      const confirmedOrders = orders.filter((order) => order.status === 'confirmed');
      const activeDeliveryRoutes = confirmedOrders.map((order) => {
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

      setState({
        products,
        orders,
        verifiedFarmers,
        registeredBuyers: buyers.filter((buyer) => buyer.id !== currentUser.id),
        registeredStakeholders: stakeholders,
        activeDeliveryRoutes,
      });
    };

    reload();
    const interval = setInterval(reload, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser.id, currentUser.municipality]);

  const { products, orders, verifiedFarmers, registeredBuyers, registeredStakeholders, activeDeliveryRoutes } = state;
  // Fresh listings only spotlights Grade A produce — Grade B is still buyable from the full
  // Marketplace, just not featured in this at-a-glance dashboard preview.
  const freshListings = products.filter((product) => product.grade === 'A');
  const matchedCommodity = orders.map((order) => matchCommodity(order.productName)).find(Boolean);
  const marketCommodityId = matchedCommodity?.id || '28';
  // Platform-wide recommendation, not personalized to this buyer's own order history — just
  // the best-reviewed farms overall. avgRating is recomputed fresh on every read (see
  // listProfiles in profiles.controller.js, never stored/cached), so a farmer starts showing
  // up here the moment their average crosses into 4-5 stars, no manual step required. Only a
  // genuinely well-reviewed farm qualifies — an unrated or poorly-rated one never appears.
  const recommendedFarmers = [...verifiedFarmers]
    .filter((farmer) => farmer.avgRating >= 4)
    .sort((a, b) => b.avgRating - a.avgRating || b.ratingCount - a.ratingCount)
    .slice(0, 4);
  // Same "paid orders" definition used for the farmer's total income and the admin's
  // platform-wide revenue — just scoped to this buyer's own orders (see reportService.js).
  const totalSpend = getTotalRevenue(orders);
  // The dashboard map is a small "who's nearby" widget, not the full directory — nearest-
  // first and capped, unlike verifiedFarmers above (kept platform-wide for the ratings-based
  // recommendation list).
  const nearbyFarmers = nearestByMunicipality(currentUser.municipality, verifiedFarmers);
  const nearbyBuyers = nearestByMunicipality(currentUser.municipality, registeredBuyers);
  const nearbyStakeholders = nearestByMunicipality(currentUser.municipality, registeredStakeholders);

  return (
    <AppShell
      user={currentUser}
      navItems={buyerNavItems}
      title={`Welcome, ${getFirstName(currentUser.name)}!`}
      subtitle="Browse Cebu harvests, check out, and track delivery from local farmers."
    >
      <section className="stats-grid">
        <StatCard label="Total spend" value={formatCurrency(totalSpend)} icon={<Wallet size={20} />} />
        <StatCard label="Active listings" value={products.length} icon={<Store size={20} />} />
        <StatCard label="My orders" value={orders.length} icon={<ShoppingBag size={20} />} />
        <StatCard label="Pending" value={orders.filter((order) => order.status === 'pending').length} icon={<Clock3 size={20} />} />
        <StatCard label="Completed" value={orders.filter((order) => order.status === 'completed').length} icon={<PackageCheck size={20} />} />
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
      </section>

      <MarketPricePanel commodityId={marketCommodityId} perspective="buyer" />

      <section className="content-grid two">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Marketplace</p>
              <h2>Fresh listings</h2>
            </div>
            <Link className="btn btn-secondary btn-md" to="/marketplace">Browse all</Link>
          </div>
          {freshListings.length ? (
            <div className="product-grid preview">
              {freshListings.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          ) : (
            <EmptyState title="No products yet" message="Farmer listings will appear here once products are added." />
          )}
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">History</p>
              <h2>Recent orders</h2>
            </div>
            <Link className="btn btn-secondary btn-md" to="/buyer-orders">View history</Link>
          </div>
          <DataTable
            columns={[
              { key: 'productName', label: 'Product' },
              { key: 'quantity', label: 'Qty' },
              { key: 'paymentStatus', label: 'Payment', render: (row) => <StatusBadge value={row.paymentStatus} type="paymentStatus" /> },
              { key: 'deliveryStatus', label: 'Delivery', render: (row) => <StatusBadge value={row.deliveryStatus} type="deliveryStatus" /> },
              { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
              { key: 'createdAt', label: 'Date', render: (row) => formatDate(row.createdAt) },
            ]}
            rows={orders.slice(0, 5)}
            emptyMessage="No orders yet."
          />
        </div>
      </section>

      {recommendedFarmers.length ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">For you</p>
              <h2>Recommended farms</h2>
            </div>
          </div>
          <div className="content-grid two">
            {recommendedFarmers.map((farmer) => (
              <Link
                key={farmer.id}
                className="recommended-farm-card"
                to={`/marketplace?farmerId=${farmer.id}&farmerName=${encodeURIComponent(farmer.farmName || farmer.name)}`}
              >
                <span className="farmer-list-avatar">
                  {farmer.avatarUrl ? <img src={farmer.avatarUrl} alt="" /> : getInitials(farmer.name)}
                </span>
                <span className="farmer-list-text">
                  <strong>{farmer.farmName || farmer.name}</strong>
                  <span className="muted"><MapPin size={13} /> {farmer.municipality}</span>
                </span>
                <span className="rating-summary">
                  <StarRating value={farmer.avgRating} />
                  <strong>{farmer.avgRating}</strong> ({farmer.ratingCount})
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
