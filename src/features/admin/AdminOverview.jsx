import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeAlert } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import StatCard from '../../components/admin/StatCard';
import { Card, CardHeader } from '../../components/admin/Card';
import Table from '../../components/admin/Table';
import Badge from '../../components/admin/Badge';
import LoadingState from '../../components/admin/LoadingState';
import { verificationTone, accountTone, verificationStatusLabel } from '../../components/admin/statusTone';
import { useAuth } from '../auth/AuthContext';
import { getUsers } from '../../services/authService';
import { getPendingPriceReviews, getProducts } from '../../services/productService';
import { getOrders } from '../../services/orderService';
import { getDonations } from '../../services/donationService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { adminNavItems } from './adminNav';

function ReviewQueueBanner({ count, label, to }) {
  if (!count) return null;
  return (
    <Link
      to={to}
      className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[#D0D7DE] bg-[#FFF8C5] px-4 py-3 text-[13px] text-[#24292F] transition-colors duration-150 hover:bg-[#FFF3AD]"
    >
      <span className="flex items-center gap-2 font-medium">
        <BadgeAlert size={16} className="text-[#9A6700]" />
        {count} {label}{count === 1 ? '' : 's'} awaiting review
      </span>
      <span className="text-[12px] font-semibold text-[#9A6700]">Review →</span>
    </Link>
  );
}

const EMPTY_STATE = {
  users: null, products: null, orders: null, donations: null, pendingPriceReviews: null,
};

export default function AdminOverview() {
  const { currentUser } = useAuth();
  const [state, setState] = useState(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getUsers(), getProducts(), getOrders(), getPendingPriceReviews()]).then(([users, products, orders, pendingPriceReviews]) => {
      if (cancelled) return;
      setState({
        users, products, orders, pendingPriceReviews, donations: getDonations(),
      });
    });
    return () => { cancelled = true; };
  }, []);

  const isLoading = state.users === null;
  const {
    users, products, orders, donations, pendingPriceReviews,
  } = state;

  const pendingVerifications = users ? users.filter((user) => user.verificationStatus === 'pending') : [];
  const monthlySales = orders
    ? orders.filter((order) => order.paymentStatus === 'paid').reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)
    : 0;

  return (
    <AppShell user={currentUser} navItems={adminNavItems} title="Admin dashboard" fullBleed>
      <PageHeader title="Dashboard" description="Monitor HarvestLink activity across users, products, orders, and surplus donations." />

      {isLoading ? (
        <LoadingState rows={4} />
      ) : (
        <>
          <ReviewQueueBanner count={pendingVerifications.length} label="account" to="/admin-users" />
          <ReviewQueueBanner count={pendingPriceReviews.length} label="price review" to="/admin-price-monitoring" />

          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Users" value={users.length} />
            <StatCard label="Products" value={products.length} />
            <StatCard label="Orders" value={orders.length} />
            <StatCard label="Donations" value={donations.length} />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Recent users" action={<Link to="/admin-users" className="text-[13px] font-medium text-[#166534] hover:underline">View all</Link>} />
              <Table
                columns={[
                  { key: 'name', label: 'Name' },
                  { key: 'role', label: 'Role' },
                  {
                    key: 'verificationStatus',
                    label: 'Verification',
                    render: (row) => (row.verificationStatus ? <Badge tone={verificationTone(row.verificationStatus)}>{verificationStatusLabel(row.verificationStatus)}</Badge> : '—'),
                  },
                  {
                    key: 'accountStatus',
                    label: 'Account',
                    render: (row) => <Badge tone={accountTone(row.accountStatus)}>{row.accountStatus === 'suspended' ? 'Suspended' : 'Active'}</Badge>,
                  },
                ]}
                rows={users.slice(0, 5)}
                emptyMessage="No registered users yet."
              />
            </Card>

            <Card>
              <CardHeader title="Recent orders" action={<Link to="/admin-orders" className="text-[13px] font-medium text-[#166534] hover:underline">View all</Link>} />
              <Table
                columns={[
                  { key: 'buyerName', label: 'Buyer' },
                  { key: 'productName', label: 'Product' },
                  { key: 'quantity', label: 'Qty' },
                  { key: 'createdAt', label: 'Created', render: (row) => formatDate(row.createdAt) },
                ]}
                rows={orders.slice(0, 5)}
                emptyMessage="No orders yet."
              />
            </Card>
          </div>

          <Card>
            <CardHeader eyebrow="Revenue" title="Paid order value" action={<strong className="text-[18px] font-semibold text-[#24292F]">{formatCurrency(monthlySales)}</strong>} />
          </Card>
        </>
      )}
    </AppShell>
  );
}
