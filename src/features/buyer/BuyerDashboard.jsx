import { useEffect, useReducer } from 'react';
import { Clock3, PackageCheck, ShoppingBag, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import StatCard from '../../components/cards/StatCard';
import ProductCard from '../../components/cards/ProductCard';
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/dashboard/DataTable';
import EmptyState from '../../components/common/EmptyState';
import DeliveryMap from '../../components/orders/DeliveryMap';
import MarketPricePanel from '../../components/market/MarketPricePanel';
import { useAuth } from '../auth/AuthContext';
import { getVerifiedFarmers } from '../../services/authService';
import { getActiveProducts } from '../../services/productService';
import { getLiveTransitProgress, getOrdersByBuyer } from '../../services/orderService';
import { matchCommodity } from '../../services/marketPriceService';
import { STORAGE_KEYS } from '../../utils/constants';
import { formatDate, getFirstName } from '../../utils/formatters';
import { buyerNavItems } from './buyerNav';

export default function BuyerDashboard() {
  const { currentUser } = useAuth();
  const [, forceRefresh] = useReducer((tick) => tick + 1, 0);

  useEffect(() => {
    const handleStorage = (event) => {
      if (!event.key || event.key === STORAGE_KEYS.orders) forceRefresh();
    };
    const interval = setInterval(forceRefresh, 4000);
    window.addEventListener('storage', handleStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const products = getActiveProducts();
  const orders = getOrdersByBuyer(currentUser.id);
  const confirmedOrders = orders.filter((order) => order.status === 'confirmed');
  const verifiedFarmers = getVerifiedFarmers();

  const activeDeliveryRoutes = confirmedOrders.map((order) => {
    const { progress, etaMinutes } = getLiveTransitProgress(order);
    return {
      id: order.id,
      originLabel: `${order.farmerName} (farmer)`,
      destinationLabel: order.deliveryMethod === 'buyer_pickup' ? `${order.buyerName} (pickup here)` : `${order.buyerName} (you)`,
      originMunicipality: order.originMunicipality,
      destinationMunicipality: order.deliveryMunicipality,
      progress,
      etaMinutes,
      label: `${order.productName} — ${order.farmerName}`,
      href: `/orders/${order.id}`,
    };
  });

  const matchedCommodity = orders.map((order) => matchCommodity(order.productName)).find(Boolean);
  const marketCommodityId = matchedCommodity?.id || '28';

  return (
    <AppShell
      user={currentUser}
      navItems={buyerNavItems}
      title={`Welcome, ${getFirstName(currentUser.name)}!`}
      subtitle="Browse Cebu harvests, check out, and track delivery from local farmers."
    >
      <section className="stats-grid">
        <StatCard label="Active listings" value={products.length} icon={<Store size={20} />} />
        <StatCard label="My orders" value={orders.length} icon={<ShoppingBag size={20} />} />
        <StatCard label="Pending" value={orders.filter((order) => order.status === 'pending').length} icon={<Clock3 size={20} />} />
        <StatCard label="Completed" value={orders.filter((order) => order.status === 'completed').length} icon={<PackageCheck size={20} />} />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Map</p>
            <h2>Active deliveries</h2>
            <p className="map-legend">
              <span className="legend-dot origin" /> Farmer/pickup
              <span className="legend-dot destination" /> Delivery to you
              <span className="legend-dot farmer" /> Verified farmer
            </p>
          </div>
          <span className="live-indicator"><span className="live-dot" /> Live</span>
        </div>
        <DeliveryMap routes={activeDeliveryRoutes} farmers={verifiedFarmers} />
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
          {products.length ? (
            <div className="product-grid preview">
              {products.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} />)}
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
    </AppShell>
  );
}
