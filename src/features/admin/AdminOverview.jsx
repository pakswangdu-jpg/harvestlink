import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeAlert, ClipboardList, Gift, PackageCheck, Tag, TrendingUp, UserPlus, Users,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import StatCard from '../../components/admin/StatCard';
import { Card, CardHeader } from '../../components/admin/Card';
import Table from '../../components/admin/Table';
import EmptyState from '../../components/admin/EmptyState';
import LoadingState from '../../components/admin/LoadingState';
import { useAuth } from '../auth/AuthContext';
import { getUsers } from '../../services/authService';
import { getPendingPriceReviews, getProducts } from '../../services/productService';
import { getOrders } from '../../services/orderService';
import { getDonations } from '../../services/donationService';
import { MARKET_COMMODITIES, getAllPriceOverrides, matchCommodity } from '../../services/marketPriceService';
import { getTotalRevenue } from '../../services/reportService';
import { formatCurrency, formatRelativeTime } from '../../utils/formatters';
import { adminNavItems } from './adminNav';

function ReviewQueueBanner({ count, label, to }) {
  if (!count) return null;
  return (
    <Link
      to={to}
      className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--amber-100)] px-4 py-3 text-[13px] text-[var(--text)] transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--amber-700)_15%,var(--amber-100))]"
    >
      <span className="flex items-center gap-2 font-medium">
        <BadgeAlert size={16} className="text-[var(--amber-700)]" />
        {count} {label}{count === 1 ? '' : 's'} awaiting review
      </span>
      <span className="text-[12px] font-semibold text-[var(--amber-700)]">Review →</span>
    </Link>
  );
}

// A compact label/value pair, smaller than the hero StatCards above — for the two summary
// widgets (Price Monitoring, Donations) that link out to their own full page rather than
// trying to be a second copy of it.
function MiniStat({ label, value, tone }) {
  const TONE_TEXT = {
    green: 'text-[var(--green-700)]',
    amber: 'text-[var(--amber-700)]',
    blue: 'text-[var(--blue-700)]',
    muted: 'text-[var(--text)]',
  };
  return (
    <div>
      <p className="text-[12px] text-[var(--muted)]">{label}</p>
      <p className={`text-[18px] font-semibold leading-tight ${TONE_TEXT[tone] || TONE_TEXT.muted}`}>{value}</p>
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
    <div className="flex items-start gap-3 py-2.5">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${ACTIVITY_TONE_CLASSES[tone]}`}>
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
  users: null, products: null, orders: null, donations: null, pendingPriceReviews: null, priceOverrides: null,
};

export default function AdminOverview() {
  const { currentUser } = useAuth();
  const [state, setState] = useState(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getUsers(), getProducts(), getOrders(), getPendingPriceReviews(), getAllPriceOverrides()])
      .then(([users, products, orders, pendingPriceReviews, priceOverrides]) => {
        if (cancelled) return;
        setState({
          users, products, orders, pendingPriceReviews, priceOverrides, donations: getDonations(),
        });
      });
    return () => { cancelled = true; };
  }, []);

  const isLoading = state.users === null;
  const {
    users, products, orders, donations, pendingPriceReviews, priceOverrides,
  } = state;

  const pendingVerifications = users ? users.filter((user) => user.verificationStatus === 'pending') : [];
  const totalRevenue = orders ? getTotalRevenue(orders) : 0;
  const completedDonations = donations ? donations.filter((donation) => donation.status === 'completed').length : 0;

  // Same real counts the Price Monitoring page itself shows (see AdminPriceMonitoring.jsx) —
  // computed directly from data this page already fetches, not the expensive per-commodity
  // PSA-price hook that page uses for its full table.
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
    <AppShell user={currentUser} navItems={adminNavItems} title="Admin dashboard" hideHeader>
      <PageHeader title="Dashboard" description="Monitor HarvestLink activity across users, products, orders, and surplus donations." />

      {isLoading ? (
        <LoadingState rows={4} />
      ) : (
        <>
          <ReviewQueueBanner count={pendingVerifications.length} label="account" to="/admin-users" />
          <ReviewQueueBanner count={pendingPriceReviews.length} label="price review" to="/admin-price-monitoring" />

          <div className="mb-4 grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4">
            <StatCard label="Total sales" value={formatCurrency(totalRevenue)} icon={TrendingUp} tone="green" />
            <StatCard label="Total orders" value={orders.length} icon={ClipboardList} tone="blue" />
            <StatCard label="Registered users" value={users.length} icon={Users} tone="slate" />
            <StatCard label="Donations completed" value={completedDonations} icon={Gift} tone="amber" />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
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

            <Card>
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

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader
                eyebrow="DTI oversight"
                title="Price monitoring"
                action={<Link to="/admin-price-monitoring" className="text-[13px] font-medium text-[var(--green-800)] hover:underline">View all</Link>}
              />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <MiniStat label="PSA commodities" value={MARKET_COMMODITIES.length} tone="muted" />
                <MiniStat label="Farmer listings" value={farmerListingsCount} tone="blue" />
                <MiniStat label="Price alerts" value={pendingPriceReviews.length} tone={pendingPriceReviews.length ? 'amber' : 'muted'} />
                <MiniStat label="Overridden prices" value={priceOverrides.length} tone="muted" />
              </div>
            </Card>

            <Card>
              <CardHeader
                eyebrow="Surplus"
                title="Donations"
                action={<Link to="/admin-donations" className="text-[13px] font-medium text-[var(--green-800)] hover:underline">View all</Link>}
              />
              <div className="grid grid-cols-3 gap-4">
                <MiniStat label="Completed" value={completedDonations} tone="green" />
                <MiniStat label="Pending" value={donations.filter((donation) => donation.status === 'requested' || donation.status === 'scheduled').length} tone="amber" />
                <MiniStat label="Available" value={donations.filter((donation) => donation.status === 'available').length} tone="muted" />
              </div>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
