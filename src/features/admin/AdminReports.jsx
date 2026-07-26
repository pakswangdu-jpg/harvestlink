import { useEffect, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import StatCard from '../../components/admin/StatCard';
import { Card, CardHeader } from '../../components/admin/Card';
import Table from '../../components/admin/Table';
import EmptyState from '../../components/admin/EmptyState';
import LoadingState from '../../components/admin/LoadingState';
import RevenueTrendChart from '../../components/charts/RevenueTrendChart';
import StatusDistributionChart from '../../components/charts/StatusDistributionChart';
import { useAuth } from '../auth/AuthContext';
import { getUsers } from '../../services/authService';
import { getOrders } from '../../services/orderService';
import { getDonations } from '../../services/donationService';
import {
  getDonationStatusBreakdown, getMonthlyRevenue, getOrderStatusBreakdown, getTopProducts, getTotalRevenue, getUserRoleBreakdown,
} from '../../services/reportService';
import { donationStatusLabel, formatCurrency } from '../../utils/formatters';
import { adminNavItems } from './adminNav';

export default function AdminReports() {
  const { currentUser } = useAuth();
  const [state, setState] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getUsers(), getOrders()]).then(([users, orders]) => {
      if (cancelled) return;
      setState({ users, orders, donations: getDonations() });
    });
    return () => { cancelled = true; };
  }, []);

  if (!state) {
    return (
      <AppShell user={currentUser} navItems={adminNavItems} title="Reports" fullBleed>
        <PageHeader title="Reports" description="Revenue, order, and donation trends across HarvestLink." />
        <LoadingState rows={4} />
      </AppShell>
    );
  }

  const { users, orders, donations } = state;
  const totalRevenue = getTotalRevenue(orders);
  const monthlyRevenue = getMonthlyRevenue(orders, 6);
  const topProducts = getTopProducts(orders, 5);
  const completedDonations = donations.filter((donation) => donation.status === 'completed').length;

  return (
    <AppShell user={currentUser} navItems={adminNavItems} title="Reports" fullBleed>
      <PageHeader title="Reports" description="Revenue, order, and donation trends across HarvestLink." />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total sales" value={formatCurrency(totalRevenue)} />
        <StatCard label="Total orders" value={orders.length} />
        <StatCard label="Registered users" value={users.length} />
        <StatCard label="Donations completed" value={completedDonations} />
      </div>

      <Card className="mb-4">
        <CardHeader eyebrow="Sales" title="Revenue — last 6 months" />
        <RevenueTrendChart points={monthlyRevenue} />
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Issues" title="Orders by status" />
          <StatusDistributionChart
            records={orders}
            computeBreakdown={(filteredOrders) => getOrderStatusBreakdown(filteredOrders).map((entry) => ({
              key: entry.status,
              status: entry.status,
              label: entry.status.charAt(0).toUpperCase() + entry.status.slice(1),
              count: entry.count,
            }))}
          />
        </Card>

        <Card>
          <CardHeader eyebrow="Surplus" title="Donations by status" />
          <StatusDistributionChart
            records={donations}
            computeBreakdown={(filteredDonations) => getDonationStatusBreakdown(filteredDonations).map((entry) => ({
              key: entry.status,
              status: entry.status,
              label: donationStatusLabel(entry.status),
              count: entry.count,
            }))}
          />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader eyebrow="Product" title="Top products by revenue" />
          {topProducts.length ? (
            <Table
              columns={[
                { key: 'productName', label: 'Product' },
                { key: 'farmerName', label: 'Farmer' },
                { key: 'unitsSold', label: 'Units sold', render: (row) => `${row.unitsSold} ${row.unit}` },
                { key: 'revenue', label: 'Revenue', render: (row) => formatCurrency(row.revenue) },
              ]}
              rows={topProducts.map((row) => ({ ...row, id: row.productId }))}
              emptyMessage="No paid orders yet."
            />
          ) : (
            <EmptyState title="No sales yet" message="Top-selling products will appear here once orders are paid." />
          )}
        </Card>

        <Card>
          <CardHeader eyebrow="Market" title="Users by role" />
          <StatusDistributionChart
            records={users}
            computeBreakdown={(filteredUsers) => getUserRoleBreakdown(filteredUsers)
              .filter((entry) => entry.count > 0)
              .map((entry) => ({
                key: entry.role,
                status: entry.role,
                label: entry.role.charAt(0).toUpperCase() + entry.role.slice(1),
                count: entry.count,
              }))}
          />
        </Card>
      </div>
    </AppShell>
  );
}
