import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Clock3, Eye, MapPin, Package, PackageSearch, Wallet } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import ProductCard from '../../components/cards/ProductCard';
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/dashboard/DataTable';
import EmptyState from '../../components/common/EmptyState';
import StarRating from '../../components/common/StarRating';
import DeliveryMap from '../../components/orders/DeliveryMap';
import MarketPricePanel from '../../components/market/MarketPricePanel';
import { useMapCoordinates } from '../../hooks/useMapCoordinates';
import { useAuth } from '../auth/AuthContext';
import { getBuyers, getStakeholders, getVerifiedFarmers } from '../../services/authService';
import { getActiveProducts } from '../../services/productService';
import { getOrdersByBuyer } from '../../services/orderService';
import { matchCommodity } from '../../services/marketPriceService';
import { getTotalRevenue } from '../../services/reportService';
import { formatCurrency, formatDate, getFirstName, getInitials, shortOrderId } from '../../utils/formatters';
import { haversineKm, nearestByMunicipality } from '../../utils/geo';
import { buyerNavItems } from './buyerNav';

// How many nearby farms the dashboard widget lists. The list itself is capped to roughly four
// rows tall and scrolls past that (see .nearby-farmers-list), so this is about how far the
// "who's nearby" shortlist reaches, not how much vertical space it takes.
const NEARBY_FARMERS_LIMIT = 10;

const EMPTY_STATE = {
  products: [], orders: [], verifiedFarmers: [], registeredBuyers: [], registeredStakeholders: [],
};

export default function BuyerDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState(EMPTY_STATE);
  const farmerCoordsById = useMapCoordinates(state.verifiedFarmers);
  const buyerCoordsById = useMapCoordinates([currentUser]);

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

      setState({
        products,
        orders,
        verifiedFarmers,
        registeredBuyers: buyers.filter((buyer) => buyer.id !== currentUser.id),
        registeredStakeholders: stakeholders,
      });
    };

    reload();
    const interval = setInterval(reload, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser.id, currentUser.municipality]);

  const { products, orders, verifiedFarmers, registeredBuyers, registeredStakeholders } = state;
  const pendingOrders = orders.filter((order) => order.status === 'pending');
  const completedOrders = orders.filter((order) => order.status === 'completed');
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
  const buyerCoords = buyerCoordsById[currentUser.id];
  const nearbyFarmersWithDistance = nearbyFarmers
    .slice(0, NEARBY_FARMERS_LIMIT)
    .map((farmer) => ({
      farmer,
      distanceKm: buyerCoords && farmerCoordsById[farmer.id]
        ? haversineKm(buyerCoords, farmerCoordsById[farmer.id])
        : null,
    }))
    .sort((a, b) => {
      if (a.distanceKm == null) return 1;
      if (b.distanceKm == null) return -1;
      return a.distanceKm - b.distanceKm;
    });
  const nearbyBuyers = nearestByMunicipality(currentUser.municipality, registeredBuyers);
  const nearbyStakeholders = nearestByMunicipality(currentUser.municipality, registeredStakeholders);

  return (
    <AppShell
      user={currentUser}
      navItems={buyerNavItems}
      title={`Welcome, ${getFirstName(currentUser.name)}`}
      subtitle="Browse Cebu harvests, check farmgate prices, and track orders from nearby farms."
      pageClassName="buyer-dashboard-page"
    >
      <section className="buyer-overview" aria-label="Account overview">
      <div className="product-stats-bar">
        <div className="product-stats-item">
          <div className="product-stats-label-row"><Wallet size={16} className="product-stats-icon" aria-hidden="true" /><p className="product-stats-label">Total spend</p></div>
          <p className="product-stats-value">{formatCurrency(totalSpend)}</p>
          <p className="product-stats-hint">Lifetime paid orders</p>
        </div>
        <div className="product-stats-item">
          <div className="product-stats-label-row"><Package size={16} className="product-stats-icon" aria-hidden="true" /><p className="product-stats-label">Active listings</p></div>
          <p className="product-stats-value">{products.length}</p>
          <p className="product-stats-hint">Across the marketplace</p>
        </div>
        <div className="product-stats-item">
          <div className="product-stats-label-row"><ClipboardList size={16} className="product-stats-icon" aria-hidden="true" /><p className="product-stats-label">My orders</p></div>
          <p className="product-stats-value">{orders.length}</p>
          <p className="product-stats-hint">All-time</p>
        </div>
        <div className="product-stats-item accent-warning">
          <div className="product-stats-label-row"><Clock3 size={16} className="product-stats-icon" aria-hidden="true" /><p className="product-stats-label">Pending</p></div>
          <p className="product-stats-value">{pendingOrders.length}</p>
          <p className="product-stats-hint">Awaiting confirmation</p>
        </div>
        <div className="product-stats-item accent-success">
          <div className="product-stats-label-row"><CheckCircle2 size={16} className="product-stats-icon" aria-hidden="true" /><p className="product-stats-label">Completed</p></div>
          <p className="product-stats-value">{completedOrders.length}</p>
          <p className="product-stats-hint">Received orders</p>
        </div>
      </div>
      </section>

      <section className="content-grid two buyer-dashboard-primary">
        <div className="panel buyer-map-panel">
          <div className="section-heading">
            <div>
              <h2>Nearby farmers</h2>
              <p className="section-supporting-text">Active farms around {currentUser.municipality || 'Cebu'}.</p>
              <p className="map-legend">
                <span className="legend-dot farmer" /> Farmer
                <span className="legend-dot buyer" /> Buyer
                <span className="legend-dot stakeholder" /> Stakeholder
              </p>
            </div>
            <span className="live-indicator"><span className="live-dot" /> Live</span>
          </div>
          <DeliveryMap
            farmers={nearbyFarmers}
            buyers={nearbyBuyers}
            stakeholders={nearbyStakeholders}
            viewerMunicipality={currentUser.municipality}
          />
          {nearbyFarmers.length ? (
            <ul className="nearby-farmers-list">
              {nearbyFarmersWithDistance.map(({ farmer, distanceKm }) => (
                <li key={farmer.id}>
                  <Link to={`/marketplace?farmerId=${farmer.id}&farmerName=${encodeURIComponent(farmer.farmName || farmer.name)}`}>
                    <span className="farmer-list-avatar">
                      {farmer.avatarUrl ? <img src={farmer.avatarUrl} alt="" /> : getInitials(farmer.name)}
                    </span>
                    <span className="farmer-list-text">
                      <strong>{farmer.farmName || farmer.name}</strong>
                      <span className="muted nearby-farmer-location">
                        <MapPin size={12} /> {farmer.municipality}
                        <span aria-hidden="true">·</span>
                        {distanceKm == null
                          ? 'Distance unavailable'
                          : distanceKm < 1
                            ? `${Math.round(distanceKm * 1000)} m away`
                            : `${distanceKm.toFixed(1)} km away`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <MarketPricePanel commodityId={marketCommodityId} perspective="buyer" />
      </section>

      <section className="content-grid two buyer-dashboard-secondary">
        <div className="panel">
          <div className="section-heading">
            <div>
              <h2>Fresh listings</h2>
              <p className="section-supporting-text">Grade A produce currently for sale.</p>
            </div>
            <Link className="btn btn-secondary btn-sm" to="/marketplace">Browse all</Link>
          </div>
          {freshListings.length ? (
            <div className="product-grid preview">
              {freshListings.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          ) : (
            <EmptyState
              icon={PackageSearch}
              title="No products yet"
              message="Farmer listings will appear here once products are added."
              actionLabel="Browse all"
              onAction={() => navigate('/marketplace')}
              compact
            />
          )}
        </div>

        <div className="panel">
          <div className="section-heading">
            <div>
              <h2>Recent orders</h2>
              <p className="section-supporting-text">Latest purchases and delivery status.</p>
            </div>
            <Link className="btn btn-secondary btn-sm" to="/buyer-orders">View history</Link>
          </div>
          <DataTable
            columns={[
              { key: 'id', label: 'Order', width: '68px', render: (row) => <span className="buyer-order-id">{shortOrderId(row.id)}</span> },
              {
                key: 'productName',
                label: 'Product',
                render: (row) => (
                  <div className="buyer-order-product-cell">
                    <strong className="truncate" title={row.productName}>{row.productName}</strong>
                    <span className="muted truncate" title={row.farmerName}>{row.farmerName}</span>
                  </div>
                ),
              },
              { key: 'totalAmount', label: 'Total', width: '78px', render: (row) => formatCurrency(row.totalAmount) },
              { key: 'createdAt', label: 'Date', width: '84px', render: (row) => <span className="muted">{formatDate(row.createdAt)}</span> },
              { key: 'status', label: 'Status', width: '92px', render: (row) => <StatusBadge value={row.status} /> },
              {
                key: 'action',
                label: '',
                width: '36px',
                align: 'right',
                render: (row) => (
                  <Link className="dashboard-row-action" to={`/orders/${row.id}`} aria-label={`View order ${row.id}`}>
                    <Eye size={16} aria-hidden="true" />
                  </Link>
                ),
              },
            ]}
            rows={orders.slice(0, 5)}
            emptyMessage={{
              title: 'No orders yet',
              message: 'Orders you place in the marketplace will appear here.',
            }}
          />
        </div>
      </section>

      {recommendedFarmers.length ? (
        <section className="panel buyer-recommended-panel">
          <div className="section-heading">
            <div>
              <h2>Recommended farms</h2>
              <p className="section-supporting-text">Highest-rated verified farms on HarvestLink.</p>
            </div>
          </div>
          <div className="buyer-recommended-grid">
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
