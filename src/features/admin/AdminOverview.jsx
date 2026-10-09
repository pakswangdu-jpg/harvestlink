import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeAlert, ClipboardList, Gift, PackageCheck, Tag, TrendingUp, UserPlus, Users,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import { Card, CardHeader } from '../../components/admin/Card';
import Table from '../../components/admin/Table';
import EmptyState from '../../components/admin/EmptyState';
import LoadingState from '../../components/admin/LoadingState';
import { useAuth } from '../auth/AuthContext';
import { getUsers } from '../../services/authService';
import { getPendingPriceReviews, getProducts } from '../../services/productService';
import { getOrders } from '../../services/orderService';
import { useDonationList } from '../../hooks/useDonationList';
import { MARKET_COMMODITIES, getAllPriceOverrides, matchCommodity } from '../../services/marketPriceService';
import { getTotalRevenue } from '../../services/reportService';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';
import { adminNavItems } from './adminNav';
import './AdminOverview.css';

function OverviewMetric({ label, value, icon: Icon, tone }) {
  return (
    <div className={`overview-metric overview-metric-${tone}`}>
      <strong>{value}</strong>
      <span><Icon size={17} strokeWidth={1.8} aria-hidden="true" />{label}</span>
    </div>
  );
}

function ReviewQueueBanner({ count, label, to }) {
  if (!count) return null;
  return (
    <Link
      to={to}
      className="overview-review-banner"
    >
      <span className="flex items-center gap-2 font-medium">
        <BadgeAlert size={16} aria-hidden="true" />
        <span><strong>{count}</strong> {label}{count === 1 ? '' : 's'} awaiting review</span>
      </span>
      <span className="overview-review-action">Review →</span>
    </Link>
  );
}




function MiniStat({ label, value, tone }) {
  const TONE_TEXT = {
    green: 'text-[var(--green-700)]',
    amber: 'text-[var(--amber-700)]',
    blue: 'text-[var(--blue-700)]',
    muted: 'text-[var(--text)]',
  };
  return (
    <div className={`overview-mini-stat overview-mini-stat-${tone}`}>
      <p className="text-[12px] text-[var(--muted)]">{label}</p>
      <p className={`text-[18px] font-medium leading-tight tabular-nums ${TONE_TEXT[tone] || TONE_TEXT.muted}`}>{value}</p>
    </div>
  );
}

const ACTIVITY_TONE_CLASSES = {
  green: 'text-[var(--green-700)]',
  blue: 'text-[var(--blue-700)]',
  amber: 'text-[var(--amber-700)]',
  violet: 'text-[var(--violet-700)]',
};

function ActivityRow({ icon: Icon, tone, message, at }) {
  return (
    <div className="overview-activity-row">
      <div className={`overview-activity-icon overview-activity-icon-${tone} ${ACTIVITY_TONE_CLASSES[tone]}`}>
        <Icon size={16} strokeWidth={2} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-[var(--text)]">{message}</p>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">{formatRelativeTime(at)}</p>
      </div>
    </div>
  );
}

const EMPTY_STATE = {
  users: null, products: null, orders: null, pendingPriceReviews: null, priceOverrides: null,
};

export default function AdminOverview() {
  const { currentUser } = useAuth();
  const [state, setState] = useState(EMPTY_STATE);
  const [loadError, setLoadError] = useState('');
  const { donations, loading: donationsLoading, loadError: donationError } = useDonationList();

  useEffect(() => {
    let cancelled = false;
    Promise.all([getUsers(), getProducts(), getOrders(), getPendingPriceReviews(), getAllPriceOverrides()])
      .then(([users, products, orders, pendingPriceReviews, priceOverrides]) => {
        if (cancelled) return;
        setState({
          users, products, orders, pendingPriceReviews, priceOverrides,
        });
      }).catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, []);

  const isLoading = state.users === null;
  const {
    users, products, orders, pendingPriceReviews, priceOverrides,
  } = state;

  const pendingVerifications = users ? users.filter((user) => user.verificationStatus === 'pending') : [];
  const totalRevenue = orders ? getTotalRevenue(orders) : 0;
  const completedDonations = donations ? donations.filter((donation) => donation.status === 'completed').length : 0;




  const farmerListingsCount = useMemo(
    () => (products ? products.filter((product) => product.status === 'active' && matchCommodity(product.name)).length : 0),
    [products]
  );

  const recentActivity = useMemo(() => {
    if (!users || !orders || !donations || !priceOverrides) return [];
    const items = [
      ...users.map((user) => ({
        id: `user-${user.id}`, icon: UserPlus, tone: 'green', at: user.createdAt,
        message: `New ${user.role} registered: ${user.name}`,
      })),
      ...orders.filter((order) => order.status === 'completed').map((order) => ({
        id: `order-${order.id}`, icon: PackageCheck, tone: 'blue', at: order.createdAt,
        message: `Order completed: ${order.productName} for ${order.buyerName}`,
      })),
      ...donations.filter((donation) => donation.status === 'completed').map((donation) => ({
        id: `donation-${donation.id}`, icon: Gift, tone: 'amber', at: donation.updatedAt || donation.createdAt,
        message: `Donation completed: ${donation.productName}`,
      })),
      ...priceOverrides.map((override) => ({
        id: `override-${override.commodityId}`, icon: Tag, tone: 'violet', at: override.updatedAt,
        message: `Price updated: ${override.commodityLabel}`,
      })),
    ];
    return items
      .filter((item) => item.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 6);
  }, [users, orders, donations, priceOverrides]);

  return (
    <AppShell user={currentUser} navItems={adminNavItems} title="Admin dashboard" hideHeader pageClassName="admin-overview-page">
      <PageHeader title="Dashboard" description="Monitor HarvestLink activity across users, products, orders, and surplus donations." />
      {loadError ? <div className="form-alert error" role="alert">{loadError}</div> : null}

      {isLoading ? (
        <LoadingState rows={4} />
      ) : (
        <>
          <ReviewQueueBanner count={pendingVerifications.length} label="account" to="/admin-users" />
          <ReviewQueueBanner count={pendingPriceReviews.length} label="price review" to="/admin-price-monitoring" />

          <div className="overview-metrics">
            <OverviewMetric label="Total sales" value={formatCurrency(totalRevenue)} icon={TrendingUp} tone="green" />
            <OverviewMetric label="Total orders" value={orders.length} icon={ClipboardList} tone="blue" />
            <OverviewMetric label="Registered users" value={users.length} icon={Users} tone="slate" />
            <OverviewMetric label="Donations completed" value={donationError || donationsLoading ? '--' : completedDonations} icon={Gift} tone="amber" />
          </div>

          <div className="overview-grid">
            <Card className="overview-panel overview-orders">
              <CardHeader title="Recent orders" action={<Link to="/admin-orders" className="text-[13px] font-medium text-[var(--green-800)] hover:underline">View all</Link>} />
              <Table
                columns={[
                  { key: 'buyerName', label: 'Buyer' },
                  { key: 'productName', label: 'Product' },
                  { key: 'quantity', label: 'Qty' },
                  { key: 'totalAmount', label: 'Amount', render: (row) => formatCurrency(row.totalAmount) },
                ]}
                rows={orders.slice(0, 5)}
                emptyMessage="No orders yet."
              />
            </Card>

            <Card className="overview-panel overview-activity">
              <CardHeader title="Recent activity" />
              {recentActivity.length ? (
                <div className="divide-y divide-[var(--line)]">
                  {recentActivity.map((item) => <ActivityRow key={item.id} {...item} />)}
                </div>
              ) : (
                <EmptyState title="No recent activity" message="There are no new administrative activities to display." />
              )}
            </Card>
          </div>

          <div className="overview-grid">
            <Card className="overview-panel">
              <CardHeader
                eyebrow="DTI oversight"
                title="Price monitoring"
                action={<Link to="/admin-price-monitoring" className="text-[13px] font-medium text-[var(--green-800)] hover:underline">View all</Link>}
              />
              <div className="overview-price-stats">
                <MiniStat label="PSA commodities" value={MARKET_COMMODITIES.length} tone="muted" />
                <MiniStat label="Farmer listings" value={farmerListingsCount} tone="blue" />
                <MiniStat label="Price alerts" value={pendingPriceReviews.length} tone={pendingPriceReviews.length ? 'amber' : 'muted'} />
                <MiniStat label="Overridden prices" value={priceOverrides.length} tone="muted" />
              </div>
            </Card>

            <Card className="overview-panel">
              <CardHeader
                eyebrow="Surplus"
                title="Donations"
                action={<Link to="/admin-donations" className="text-[13px] font-medium text-[var(--green-800)] hover:underline">View all</Link>}
              />
              {donationError ? <div className="form-alert warning" role="alert">{donationError}</div> : donationsLoading ? <p role="status">Loading donations...</p> : <div className="overview-donation-stats">
                <MiniStat label="Completed" value={completedDonations} tone="green" />
                <MiniStat label="Pending" value={donations.filter((donation) => donation.status === 'requested' || donation.status === 'scheduled').length} tone="amber" />
                <MiniStat label="Available" value={donations.filter((donation) => donation.status === 'available').length} tone="muted" />
              </div>}
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
