import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, BadgeCheck, CheckCircle2, ClipboardList, Clock3, Eye, Leaf, MapPin,
  Package, PackageSearch, Star, Wallet,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import ProductCard from '../../components/cards/ProductCard';
import StatusBadge from '../../components/common/StatusBadge';
import DataTable from '../../components/dashboard/DataTable';
import EmptyState from '../../components/common/EmptyState';
import DeliveryMap from '../../components/orders/DeliveryMap';
import MarketPricePanel from '../../components/market/MarketPricePanel';
import RegisteredLocationNotice from '../../components/map/RegisteredLocationNotice';
import { useAuth } from '../auth/AuthContext';
import {
  getNearbyMapProfiles, getVerifiedFarmers,
} from '../../services/authService';
import { getActiveProducts } from '../../services/productService';
import { getOrdersByBuyer } from '../../services/orderService';
import { matchCommodity } from '../../services/marketPriceService';
import { getTotalRevenue } from '../../services/reportService';
import { formatCurrency, formatDate, getFirstName, getInitials, shortOrderId } from '../../utils/formatters';
import { formatNearbyDistance, getRegisteredCoordinates, sortByRegisteredDistance } from '../../utils/geo';
import { buyerNavItems } from './buyerNav';

const NEARBY_FARMERS_LIMIT = 5;
const EMPTY_STATE = {
  products: [], orders: [], verifiedFarmers: [], nearbyMapProfiles: [],
};

function farmerMarketplacePath(farmer) {
  return `/marketplace?farmerId=${farmer.id}&farmerName=${encodeURIComponent(farmer.farmName || farmer.name)}`;
}

export default function BuyerDashboard() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState(EMPTY_STATE);
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const nearbyOrigin = getRegisteredCoordinates(currentUser);

  useEffect(() => {
    let cancelled = false;

    const reload = async () => {
      try {
        const [products, orders, verifiedFarmers, nearbyMapProfiles] = await Promise.all([
          getActiveProducts(),
          getOrdersByBuyer(currentUser.id),
          getVerifiedFarmers(),
          getNearbyMapProfiles(),
        ]);
        if (cancelled) return;

        setState({
          products,
          orders,
          verifiedFarmers,
          nearbyMapProfiles,
        });
        setLoadError('');
      } catch {
        if (!cancelled) setLoadError('Some dashboard information could not be refreshed.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    reload();
    const interval = setInterval(reload, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser.id, currentUser.municipality]);


  const {
    products, orders, verifiedFarmers, nearbyMapProfiles,
  } = state;
  const pendingOrders = orders.filter((order) => order.status === 'pending');
  const completedOrders = orders.filter((order) => order.status === 'completed');
  const freshListings = products.filter((product) => product.grade === 'A');
  const matchedCommodity = orders.map((order) => matchCommodity(order.productName)).find(Boolean);
  const marketCommodityId = matchedCommodity?.id || '28';

  const productsByFarmer = useMemo(() => {
    const grouped = new Map();
    products.forEach((product) => {
      const listings = grouped.get(product.farmerId) || [];
      listings.push(product);
      grouped.set(product.farmerId, listings);
    });
    return grouped;
  }, [products]);

  const recommendedFarmers = useMemo(() => {
    const orderedFarmerIds = new Set(orders.map((order) => order.farmerId).filter(Boolean));
    const orderedProductNames = new Set(orders.map((order) => order.productName?.toLowerCase()).filter(Boolean));

    return verifiedFarmers
      .map((farmer) => {
        const listings = productsByFarmer.get(farmer.id) || [];
        const parsedRating = Number(farmer.avgRating);
        const rating = Number.isFinite(parsedRating) ? parsedRating : 0;
        const parsedRatingCount = Number(farmer.ratingCount);
        const ratingCount = Number.isFinite(parsedRatingCount) ? parsedRatingCount : 0;
        const matchesInterest = listings.some((product) => orderedProductNames.has(product.name?.toLowerCase()));
        const isNearby = farmer.municipality && farmer.municipality === currentUser.municipality;
        const score = (isNearby ? 5 : 0)
          + (matchesInterest ? 4 : 0)
          + Math.min(listings.length, 4)
          + (rating >= 4 ? 3 : rating)
          + Math.min(farmer.completedOrders || 0, 3)
          + (orderedFarmerIds.has(farmer.id) ? 2 : 0);
        const reason = matchesInterest
          ? 'Matches products you frequently buy'
          : isNearby
            ? 'Near your location'
            : rating >= 4
              ? 'Highly rated farmer'
              : 'Fresh listings available';

        return {
          ...farmer,
          score,
          reason,
          listingCount: listings.length,
          normalizedRating: rating,
          normalizedRatingCount: ratingCount,
        };
      })
      .filter((farmer) => farmer.listingCount > 0)
      .sort((a, b) => b.score - a.score || b.normalizedRating - a.normalizedRating || b.normalizedRatingCount - a.normalizedRatingCount);
  }, [currentUser.municipality, orders, productsByFarmer, verifiedFarmers]);

  const sortedRecommendedFarmers = useMemo(
    () => [...recommendedFarmers].sort((a, b) => {
      const aIsRated = a.normalizedRating > 0;
      const bIsRated = b.normalizedRating > 0;
      return Number(bIsRated) - Number(aIsRated)
        || b.normalizedRating - a.normalizedRating
        || b.normalizedRatingCount - a.normalizedRatingCount
        || b.score - a.score;
    }),
    [recommendedFarmers]
  );
  const visibleRecommendedFarmers = showAllRecommendations
    ? sortedRecommendedFarmers
    : sortedRecommendedFarmers.slice(0, 5);
  const totalSpend = getTotalRevenue(orders);
  const sortedNearbyFarmers = sortByRegisteredDistance(nearbyOrigin, verifiedFarmers);
  const nearbyFarmersWithDistance = sortedNearbyFarmers
    .slice(0, NEARBY_FARMERS_LIMIT)
    .map((farmer) => ({ farmer, distanceKm: farmer.distanceKm, listingCount: productsByFarmer.get(farmer.id)?.length || 0 }));
  const nearbyFarmers = nearbyMapProfiles.filter((profile) => profile.role === 'farmer');
  const nearbyBuyers = nearbyMapProfiles.filter((profile) => profile.role === 'buyer');
  const nearbyStakeholders = nearbyMapProfiles.filter((profile) => profile.role === 'stakeholder');

  return (
    <AppShell
      user={currentUser}
      navItems={buyerNavItems}
      title={`Welcome back, ${getFirstName(currentUser.name)}`}
      subtitle="Find fresh produce from verified Cebu farmers and keep track of your orders."
      eyebrow="Buyer marketplace"
      pageClassName="buyer-dashboard-page"
    >
      {loadError ? <p className="buyer-dashboard-alert" role="status">{loadError}</p> : null}

      <section className="buyer-overview" aria-labelledby="buyer-overview-title" aria-busy={isLoading}>
        <div className="buyer-section-heading buyer-overview-heading">
          <div>
            <h2 id="buyer-overview-title">Buyer overview</h2>
            <p>Your orders and spending at a glance.</p>
          </div>
          <Link className="buyer-marketplace-count" to="/marketplace">
            <Package size={16} aria-hidden="true" />
            <span><strong>{isLoading ? '...' : products.length}</strong> active listings</span>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
        <div className="buyer-order-summary" aria-label="Buyer order summary">
          <Link className="buyer-summary-item" to="/buyer-orders" aria-label="View all buyer orders">
            <span className="buyer-summary-label"><ClipboardList size={18} strokeWidth={2} aria-hidden="true" /> My Orders</span>
            <strong>{isLoading ? '...' : orders.length}</strong>
            <small>View all orders <ArrowRight size={13} aria-hidden="true" /></small>
          </Link>
          <Link
            className="buyer-summary-item is-pending"
            to="/buyer-orders"
            state={{ stage: 'pending' }}
            aria-label="View pending orders"
          >
            <span className="buyer-summary-label"><Clock3 size={18} strokeWidth={2} aria-hidden="true" /> Pending</span>
            <strong>{isLoading ? '...' : pendingOrders.length}</strong>
            <small>Needs attention <ArrowRight size={13} aria-hidden="true" /></small>
          </Link>
          <Link
            className="buyer-summary-item is-complete"
            to="/buyer-orders"
            state={{ stage: 'completed' }}
            aria-label="View completed orders"
          >
            <span className="buyer-summary-label"><CheckCircle2 size={18} strokeWidth={2} aria-hidden="true" /> Completed</span>
            <strong>{isLoading ? '...' : completedOrders.length}</strong>
            <small>Orders received</small>
          </Link>
          <Link
            className="buyer-summary-item is-spend"
            to="/buyer-orders"
            state={{ paymentFilter: 'paid' }}
            aria-label={`View paid orders totaling ${formatCurrency(totalSpend)}`}
          >
            <span className="buyer-summary-label"><Wallet size={18} strokeWidth={2} aria-hidden="true" /> Total Spent</span>
            <strong>{isLoading ? '...' : formatCurrency(totalSpend)}</strong>
            <small>Paid orders</small>
          </Link>
        </div>
      </section>

      <section className="buyer-section buyer-nearby-section" aria-labelledby="nearby-farmers-title">
        <div className="buyer-section-heading">
          <div>
            <h2 id="nearby-farmers-title">Nearby farmers</h2>
            <p>Explore verified farmers and available produce near your location.</p>
          </div>
        </div>
        <RegisteredLocationNotice hasLocation={Boolean(nearbyOrigin)} />
        <p className="map-legend" aria-label="Map marker legend">
          <span><span className="legend-dot viewer" /> Your location</span>
          <span><span className="legend-dot farmer" /> Farmer</span>
          <span><span className="legend-dot buyer" /> Buyer</span>
          <span><span className="legend-dot stakeholder" /> Stakeholder</span>
        </p>
        <div className="buyer-map-surface">
          <DeliveryMap
            farmers={nearbyFarmers}
            buyers={nearbyBuyers}
            stakeholders={nearbyStakeholders}
            nearbyView
            viewerAddress={currentUser.address || currentUser.municipality || ''}
            viewerCoords={nearbyOrigin}
          />
          {nearbyFarmersWithDistance.length ? (
            <div className="nearby-list-panel">
              <div className="nearby-list-header">
                <div>
                  <span className="nearby-list-kicker">{nearbyOrigin ? 'Closest marketplace sellers' : 'Marketplace sellers'}</span>
                  <strong>{nearbyFarmersWithDistance.length} {nearbyOrigin ? 'farmers' : 'sellers'}</strong>
                </div>
                <Link to="/marketplace">Marketplace <ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
              <ul className="nearby-farmers-list">
                {nearbyFarmersWithDistance.map(({ farmer, distanceKm, listingCount }) => (
                  <li key={farmer.id}>
                    <Link to={farmerMarketplacePath(farmer)}>
                      <span className="farmer-list-avatar">
                        {farmer.avatarUrl ? <img src={farmer.avatarUrl} alt="" /> : getInitials(farmer.name)}
                      </span>
                      <span className="farmer-list-text">
                        <span className="nearby-farmer-title-row">
                          <strong>{farmer.farmName || farmer.name}</strong>
                          <span className="nearby-distance-badge">{formatNearbyDistance(distanceKm)}</span>
                        </span>
                        <span className="muted nearby-farmer-location">
                          <MapPin size={13} aria-hidden="true" /> {farmer.municipality || 'Location unavailable'}
                        </span>
                        <span className="nearby-farmer-trust">
                          <BadgeCheck size={13} aria-hidden="true" /> Verified farmer
                          {listingCount ? <><span aria-hidden="true">&middot;</span>{listingCount} active {listingCount === 1 ? 'listing' : 'listings'}</> : null}
                        </span>
                      </span>
                      <span className="nearby-farmer-action">Browse produce <ArrowRight size={15} aria-hidden="true" /></span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="buyer-inline-empty">
              <MapPin size={18} aria-hidden="true" />
              <span><strong>No nearby farmers found</strong> Try browsing all verified sellers in the marketplace.</span>
              <Link to="/marketplace">Browse marketplace</Link>
            </div>
          )}
        </div>
      </section>

      <section className="buyer-section" aria-labelledby="fresh-listings-title">
        <div className="buyer-section-heading">
          <div>
            <h2 id="fresh-listings-title">Fresh listings</h2>
            <p>Grade A produce available now from verified Cebu farmers.</p>
          </div>
          <Link className="buyer-section-action" to="/marketplace">Browse marketplace <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
        <div className="buyer-market-grid">
          <div className="buyer-listings-content">
            {freshListings.length ? (
              <div className="product-grid preview">
                {freshListings.slice(0, 3).map((product) => <ProductCard key={product.id} product={product} />)}
              </div>
            ) : (
              <EmptyState
                icon={PackageSearch}
                title="No fresh listings yet"
                message="Farmer listings will appear here once products are added."
                actionLabel="Browse marketplace"
                onAction={() => navigate('/marketplace')}
                compact
              />
            )}
          </div>
          <MarketPricePanel commodityId={marketCommodityId} perspective="buyer" />
        </div>
      </section>

      <section className="content-grid buyer-orders-recommendations" aria-label="Orders and recommendations">
        <section className="panel buyer-recent-orders" aria-labelledby="recent-orders-title">
          <div className="section-heading">
            <div>
              <h2 id="recent-orders-title">Recent orders</h2>
              <p className="section-supporting-text">Latest purchases and delivery status.</p>
            </div>
            <Link className="buyer-recent-orders-action" to="/buyer-orders">
              View order history <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <DataTable
            columns={[
              { key: 'id', label: 'Order', width: '112px', render: (row) => <span className="buyer-order-id">{shortOrderId(row.id)}</span> },
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
              { key: 'totalAmount', label: 'Total', width: '116px', align: 'right', render: (row) => <span className="buyer-order-total">{formatCurrency(row.totalAmount)}</span> },
              { key: 'createdAt', label: 'Date', width: '144px', render: (row) => <span className="muted">{formatDate(row.createdAt)}</span> },
              { key: 'status', label: 'Status', width: '112px', render: (row) => <StatusBadge value={row.status} /> },
              {
                key: 'action',
                label: '',
                width: '76px',
                align: 'right',
                render: (row) => (
                  <Link className="dashboard-row-action" to={`/orders/${row.id}`} aria-label={`View order ${row.id}`} title="View order">
                    <Eye size={15} aria-hidden="true" /> View
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
        </section>

        <section className="panel buyer-recommended-panel" aria-labelledby="recommendations-title">
          <div className="section-heading">
            <div>
              <div className="buyer-recommendation-title">
                <Leaf size={17} aria-hidden="true" />
                <h2 id="recommendations-title">Recommended for you</h2>
              </div>
              <p className="section-supporting-text">Based on your orders, location, and marketplace activity.</p>
            </div>
            {sortedRecommendedFarmers.length > 5 ? (
              <button
                type="button"
                className="buyer-recommendation-toggle"
                onClick={() => setShowAllRecommendations((showing) => !showing)}
                aria-expanded={showAllRecommendations}
              >
                {showAllRecommendations ? 'Show less' : <>Show all <ArrowRight size={14} aria-hidden="true" /></>}
              </button>
            ) : null}
          </div>
          {sortedRecommendedFarmers.length ? (
            <div className="buyer-recommended-grid">
              {visibleRecommendedFarmers.map((farmer) => (
                <Link
                  key={farmer.id}
                  className="recommended-farm-card"
                  to={farmerMarketplacePath(farmer)}
                >
                  <span className="farmer-list-avatar buyer-recommendation-avatar">
                    {farmer.avatarUrl ? <img src={farmer.avatarUrl} alt="" /> : getInitials(farmer.name)}
                  </span>
                  <span className="farmer-list-text">
                    <strong>{farmer.farmName || farmer.name}</strong>
                    <span className="buyer-recommendation-location"><MapPin size={12} aria-hidden="true" /> {farmer.municipality || 'Location unavailable'}</span>
                    <span className="buyer-recommendation-reason">{farmer.reason}</span>
                  </span>
                  <span
                    className={`buyer-rating${farmer.normalizedRating > 0 ? '' : ' is-new'}`}
                    aria-label={farmer.normalizedRating
                      ? `${farmer.normalizedRating.toFixed(1)} out of 5 stars from ${farmer.normalizedRatingCount} ${farmer.normalizedRatingCount === 1 ? 'rating' : 'ratings'}`
                      : 'Not yet rated'}
                  >
                    {farmer.normalizedRating ? (
                      <><Star size={13} fill="currentColor" aria-hidden="true" /><strong>{farmer.normalizedRating.toFixed(1)}</strong><span>({farmer.normalizedRatingCount})</span></>
                    ) : <span>New farmer</span>}
                  </span>
                  <span className="buyer-recommendation-action">View farm <ArrowRight size={14} aria-hidden="true" /></span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="buyer-inline-empty buyer-recommendations-empty">
              <Leaf size={18} aria-hidden="true" />
              <span><strong>No recommendations yet</strong> Recommendations will improve as you browse and order.</span>
            </div>
          )}
        </section>
      </section>
    </AppShell>
  );
}
