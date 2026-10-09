import { useEffect, useState } from 'react';
import { ClipboardList, Gift, TrendingUp, Users } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import { Card, CardHeader } from '../../components/admin/Card';
import Table from '../../components/admin/Table';
import EmptyState from '../../components/admin/EmptyState';
import LoadingState from '../../components/admin/LoadingState';
import RevenueTrendChart from '../../components/charts/RevenueTrendChart';
import StatusDistributionChart from '../../components/charts/StatusDistributionChart';
import { useAuth } from '../auth/AuthContext';
import { getUsers } from '../../services/authService';
import { getOrders } from '../../services/orderService';
import { useDonationList } from '../../hooks/useDonationList';
import {
  REPORT_PERIODS, filterReportRecords, getReportRevenue, getDonationStatusBreakdown, getOrderStatusBreakdown, getTopProducts, getTotalRevenue, getUserRoleBreakdown,
} from '../../services/reportService';
import { donationStatusLabel, formatCurrency } from '../../utils/formatters';
import { adminNavItems } from './adminNav';
import './AdminReports.css';

function ReportMetric({ label, value, icon: Icon, tone }) {
  return (
    <div className={`reports-metric reports-metric-${tone}`}>
      <strong>{value}</strong>
      <span><Icon size={17} strokeWidth={1.8} aria-hidden="true" />{label}</span>
    </div>
  );
}

export default function AdminReports() {
  const { currentUser } = useAuth();
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [period, setPeriod] = useState('6m');
  const [refresh, setRefresh] = useState(0);
  const { donations, loading: donationsLoading, loadError: donationError } = useDonationList();

  useEffect(() => {
    let cancelled = false;
    Promise.all([getUsers(), getOrders()]).then(([users, orders]) => {
      if (cancelled) return;
      setState({ users, orders });
      setLoadError('');
    }).catch((error) => { if (!cancelled) setLoadError(error.message); });
    return () => { cancelled = true; };
  }, [refresh]);

  if (!state) {
    return (
      <AppShell user={currentUser} navItems={adminNavItems} title="Reports" hideHeader pageClassName="admin-reports-page">
        <PageHeader title="Reports" description="Revenue, order, and donation trends across HarvestLink." />
        {loadError ? <div className="form-alert error" role="alert">{loadError} <button type="button" onClick={() => { setLoadError(''); setRefresh((value) => value + 1); }}>Try again</button></div> : <LoadingState rows={4} />}
      </AppShell>
    );
  }

  const now = new Date();
  const users = filterReportRecords(state.users, period, now);
  const orders = filterReportRecords(state.orders, period, now);
  const periodDonations = filterReportRecords(donations, period, now);
  const totalRevenue = getTotalRevenue(orders);
  const monthlyRevenue = getReportRevenue(state.orders, period, now);
  const topProducts = getTopProducts(orders, 10);
  const completedDonations = periodDonations.filter((donation) => donation.status === 'completed').length;

  return (
    <AppShell user={currentUser} navItems={adminNavItems} title="Reports" hideHeader pageClassName="admin-reports-page">
      <PageHeader title="Reports" description="Revenue, order, and donation trends across HarvestLink." />

      <div className="reports-filter-bar">
        <div><h2>Reports overview</h2><p className="reports-description">Orders, donations and registrations created in the selected period.</p></div>
        <label>Report period<select value={period} onChange={(event) => setPeriod(event.target.value)}>{REPORT_PERIODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>

      <div className="reports-summary" aria-label="Report totals">
        <ReportMetric label="Total sales" value={formatCurrency(totalRevenue)} icon={TrendingUp} tone="green" />
        <ReportMetric label="Total orders" value={orders.length} icon={ClipboardList} tone="blue" />
        <ReportMetric label="Registered users" value={users.length} icon={Users} tone="slate" />
        <ReportMetric label="Donations completed" value={donationError || donationsLoading ? '--' : completedDonations} icon={Gift} tone="amber" />
      </div>

      <Card className="reports-panel reports-revenue">
        <CardHeader title="Revenue" />
        <p className="reports-description reports-period">{REPORT_PERIODS.find(([value]) => value === period)?.[1]}</p>
        <RevenueTrendChart points={monthlyRevenue} presentation="report" />
      </Card>

      <div className="reports-grid">
        <Card className="reports-panel">
          <StatusDistributionChart
            presentation="report"
            hidePeriodFilter
            title="Orders by status"
            description="Distribution of orders by their current status."
            records={orders}
            computeBreakdown={(filteredOrders) => getOrderStatusBreakdown(filteredOrders).map((entry) => ({
              key: entry.status,
              status: entry.status,
              label: entry.status.charAt(0).toUpperCase() + entry.status.slice(1),
              count: entry.count,
            }))}
          />
        </Card>

        <Card className="reports-panel">
          {donationError || donationsLoading ? <CardHeader title="Donations by status" /> : null}
          {donationError ? <div className="form-alert warning" role="alert">{donationError}</div> : donationsLoading ? <p role="status">Loading donations...</p> : <StatusDistributionChart
            presentation="report"
            hidePeriodFilter
            title="Donations by status"
            description="Current status of produce donations."
            emptyMessage="No donation activity for this period."
            records={periodDonations}
            computeBreakdown={(filteredDonations) => getDonationStatusBreakdown(filteredDonations).map((entry) => ({
              key: entry.status,
              status: entry.status,
              label: entry.status === 'requested' ? 'Claimed / Reserved' : entry.status === 'scheduled' ? 'Pickup scheduled' : donationStatusLabel(entry.status),
              count: entry.count,
            }))}
          />}
        </Card>
      </div>

      <div className="reports-grid">
        <Card className="reports-panel reports-products">
          <CardHeader title="Top products by revenue" />
          <p className="reports-description">Products generating the highest paid-order revenue.</p>
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
              maxHeight={topProducts.length > 5 ? 280 : undefined}
            />
          ) : (
            <EmptyState title="No sales yet" message="Top-selling products will appear here once orders are paid." />
          )}
        </Card>

        <Card className="reports-panel">
          <StatusDistributionChart
            presentation="report"
            hidePeriodFilter
            title="Users by role"
            description="Farmers, buyers and stakeholders registered in the selected period."
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
