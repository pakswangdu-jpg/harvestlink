import { useEffect, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronRight, Clock3, Gift, Hourglass, MessageCircle, Package } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import MetricsSummary from '../../components/dashboard/MetricsSummary';
import DataTable from '../../components/dashboard/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import DeliveryMap from '../../components/orders/DeliveryMap';
import MarketPricePanel from '../../components/market/MarketPricePanel';
import RevenueTrendChart from '../../components/charts/RevenueTrendChart';
import FarmerReviewsPanel from './FarmerReviewsPanel';
import gcashLogo from '../../assets/icons/gcash-dashboard-logo.png';
import codLogo from '../../assets/icons/cod-dashboard-transparent.png';
import { useAuth } from '../auth/AuthContext';
import { getBuyers, getStakeholders, getVerifiedFarmers } from '../../services/authService';
import { getProductsByFarmer } from '../../services/productService';
import { getOrdersByFarmer } from '../../services/orderService';
import { getDonationsByFarmer } from '../../services/donationService';
import { matchCommodity } from '../../services/marketPriceService';
import { getMonthlyRevenue, getTotalProfit, getTotalRevenue } from '../../services/reportService';
import { formatCurrency, formatDate, getFirstName } from '../../utils/formatters';
import { nearestByMunicipality } from '../../utils/geo';
import { farmerNavItems } from './farmerNav';

const EMPTY_STATE = {
  products: [], orders: [], donations: [], otherFarmers: [], registeredBuyers: [],
  registeredStakeholders: [],
};

function getMonthlyPaymentRevenue(orders, monthsBack = 6) {
  const now = new Date();
  const months = [];
  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      year: date.getFullYear(),
      month: date.getMonth(),
      label: date.toLocaleDateString('en-PH', { month: 'short' }),
    });
  }

  return months.map(({ year, month, label }) => ({
    label,
    revenue: orders
      .filter((order) => {
        const created = new Date(order.createdAt);
        return created.getFullYear() === year && created.getMonth() === month;
      })
      .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0),
  }));
}

export default function FarmerDashboard() {
  const { currentUser, acknowledgeVerification } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState(EMPTY_STATE);
  const [expandedPayment, setExpandedPayment] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const reload = async () => {
      const [products, orders, donations, verifiedFarmers, registeredBuyers, registeredStakeholders] = await Promise.all([
        getProductsByFarmer(currentUser.id),
        getOrdersByFarmer(currentUser.id),
        getDonationsByFarmer(currentUser.id),
        getVerifiedFarmers(),
        getBuyers(),
        getStakeholders(),
      ]);
      if (cancelled) return;

      // Nearest-first and capped, not every registered account nationwide — the dashboard's
      // map is a small "who's around me" widget, not the full directory (that's what View
      // Map/Marketplace are for).
      setState({
        products,
        orders,
        donations,
        otherFarmers: nearestByMunicipality(
          currentUser.municipality,
          verifiedFarmers.filter((farmer) => farmer.id !== currentUser.id),
        ),
        registeredBuyers: nearestByMunicipality(currentUser.municipality, registeredBuyers),
        registeredStakeholders: nearestByMunicipality(currentUser.municipality, registeredStakeholders),
      });
    };

    reload();
    const interval = setInterval(reload, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentUser.id, currentUser.municipality]);

  const { products, orders, donations, otherFarmers, registeredBuyers, registeredStakeholders } = state;
  const pendingOrders = orders.filter((order) => order.status === 'pending');
  const confirmedOrders = orders.filter((order) => order.status === 'confirmed');
  const pendingDonationRequests = donations.filter((donation) => donation.status === 'requested');
  // Sums every paid order to date (COD counts once the buyer confirms delivery — see
  // advanceDelivery on the backend), same "paid orders" definition the admin dashboard's
  // own revenue figure uses, just scoped to this farmer's own orders.
  const totalIncome = getTotalRevenue(orders);
  // Profit = income minus recorded cost, but only for orders whose product had a cost on
  // file at checkout (see reportService.js).
  const totalProfit = getTotalProfit(orders);
  const activeListings = products.filter((product) => product.status === 'active').length;
  const monthlyRevenue = getMonthlyRevenue(orders, 6);
  const paidOrders = orders.filter((order) => order.paymentStatus === 'paid');
  const paymentGroups = [
    { key: 'gcash', label: 'GCash / online payments', tone: 'blue' },
    { key: 'cod', label: 'Cash on delivery', tone: 'orange' },
  ].map((group) => ({
    ...group,
    orders: paidOrders.filter((order) => order.paymentMethod === group.key),
  })).map((group) => ({
    ...group,
    chartPoints: getMonthlyPaymentRevenue(group.orders),
  }));

  const matchedCommodity = products.map((product) => matchCommodity(product.name)).find(Boolean);
  const marketCommodityId = matchedCommodity?.id || '28';

  return (
    <AppShell
      user={currentUser}
      navItems={farmerNavItems}
      title={`Welcome, ${getFirstName(currentUser.name)}!`}
      subtitle="Manage your harvest listings, orders, and surplus donations from one workspace."
      pageClassName="farmer-dashboard-page"
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

      <MetricsSummary
        financialMetrics={[
          { label: 'Total income', value: formatCurrency(totalIncome), hint: `from ${paidOrders.length} paid order${paidOrders.length === 1 ? '' : 's'}` },
          { label: 'Profit', value: formatCurrency(totalProfit), hint: 'after recorded costs', trend: totalProfit > 0 },
        ]}
        productMetrics={[
          { label: 'Total products', value: products.length },
          { label: 'Active listings', value: activeListings, hint: `active listing${activeListings === 1 ? '' : 's'}` },
        ]}
        orderMetrics={[
          { label: 'Pending orders', value: pendingOrders.length, hint: 'pending orders', tone: 'warning' },
          { label: 'Confirmed orders', value: confirmedOrders.length, tone: 'success' },
        ]}
      />

      <section className="dashboard-insights-grid">
        <div className="panel dashboard-trend-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Income trend</p>
              <h2>{formatCurrency(totalIncome)} <span>paid order income</span></h2>
              <p className="dashboard-chart-helper">Hover a point to inspect the exact revenue.</p>
            </div>
            <Link className="btn btn-secondary btn-md" to="/market-insights">
              <CalendarDays size={15} /> View trends
            </Link>
          </div>
          <RevenueTrendChart points={monthlyRevenue} />
        </div>

        <div className="panel dashboard-glance-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">At a glance</p>
              <h2>Today&apos;s workspace</h2>
            </div>
          </div>
          <div className="dashboard-glance-grid">
            <GlanceItem icon={Clock3} tone="warning" label="Pending orders" value={pendingOrders.length} href="/farmer-orders" action="View all" />
            <GlanceItem icon={CheckCircle2} tone="success" label="Confirmed orders" value={confirmedOrders.length} href="/farmer-orders" action="View all" />
            <GlanceItem icon={MessageCircle} tone="info" label="Active listings" value={activeListings} href="/farmer-products" action="Manage" />
            <GlanceItem icon={Gift} tone="rose" label="Surplus donations" value={pendingDonationRequests.length} href="/farmer-donations" action="View donations" />
          </div>
        </div>
      </section>

      <section className="dashboard-income-grid">
        <div className="panel dashboard-payment-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Income by payment method</p>
              <h2>Where paid orders came from</h2>
            </div>
          </div>
          {paymentGroups.length ? (
            <div className="dashboard-payment-list">
              {paymentGroups.map((group) => {
                const amount = group.orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
                const share = totalIncome > 0 ? (amount / totalIncome) * 100 : 0;
                const isExpanded = expandedPayment === group.key;
                return (
                  <div className={`dashboard-payment-row${isExpanded ? ' is-expanded' : ''}`} key={group.key}>
                    <span className={`dashboard-payment-icon ${group.tone}${group.key === 'cod' ? ' has-image' : ''}`}>
                      {group.key === 'gcash' ? <img src={gcashLogo} alt="" /> : <img src={codLogo} alt="" />}
                    </span>
                    <div className="dashboard-payment-copy">
                      <div className="dashboard-payment-heading">
                        <strong>{group.label}</strong>
                        <button
                          type="button"
                          className="dashboard-payment-toggle"
                          aria-label={`${isExpanded ? 'Hide' : 'Show'} ${group.label} chart`}
                          aria-expanded={isExpanded}
                          onClick={() => setExpandedPayment(isExpanded ? null : group.key)}
                        >
                          <ChevronRight size={17} aria-hidden="true" />
                        </button>
                      </div>
                      <span>{formatCurrency(amount)} from {group.orders.length} paid order{group.orders.length === 1 ? '' : 's'}</span>
                      <small>{share.toFixed(1)}% of total income</small>
                      {isExpanded ? (
                        <div className="dashboard-payment-chart">
                          <RevenueTrendChart points={group.chartPoints} compact seriesLabel={group.label} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="muted dashboard-panel-empty">Paid order income will appear here once an order is completed.</p>}
        </div>

        <div className="panel dashboard-income-summary">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Income summary</p>
              <h2>Current performance</h2>
            </div>
          </div>
          <div className="dashboard-summary-list">
            <SummaryLine label="Total income" value={formatCurrency(totalIncome)} tone="green" />
            <SummaryLine label="Recorded profit" value={formatCurrency(totalProfit)} tone="blue" />
            <SummaryLine label="Paid orders" value={paidOrders.length} />
            <SummaryLine label="Active listings" value={activeListings} />
          </div>
          <Link className="dashboard-summary-link" to="/farmer-orders">View detailed orders <span>›</span></Link>
        </div>
      </section>

      <section className="content-grid two">
        <div className="panel">
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
            farmers={otherFarmers}
            buyers={registeredBuyers}
            stakeholders={registeredStakeholders}
            alertStyle
            viewerMunicipality={currentUser.municipality}
          />
        </div>

        <MarketPricePanel commodityId={marketCommodityId} perspective="farmer" />
      </section>

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
            <EmptyState
              className="empty-state-transparent-icon"
              icon={Package}
              title="No products yet"
              message="Add your first harvest listing so buyers can discover it."
              actionLabel="Add product"
              onAction={() => navigate('/farmer-products')}
            />
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
              { key: 'buyerName', label: 'Buyer', truncate: true },
              { key: 'productName', label: 'Product', width: '95px', truncate: true },
              { key: 'paymentMethod', label: 'Payment', width: '112px', render: (row) => <StatusBadge value={row.paymentMethod} type="payment" /> },
              { key: 'status', label: 'Status', width: '84px', render: (row) => <StatusBadge value={row.status} /> },
              {
                key: 'createdAt',
                label: 'Date',
                width: '108px',
                align: 'right',
                render: (row) => <span className="muted">{formatDate(row.createdAt)}</span>,
              },
            ]}
            rows={orders.slice(0, 5)}
            emptyMessage={{ title: 'No buyer activity yet', message: 'Orders from buyers will appear here once they place an order.' }}
          />
        </div>
      </section>

      <section className="content-grid two farmer-dashboard-bottom-grid">
      <div className="panel">
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
          <EmptyState icon={Hourglass} className="empty-state-amber empty-state-transparent-icon empty-state-waiting" title="No pending donation requests" message="Donate unsold stock so partner organizations can request it." />
        )}
      </div>

      <FarmerReviewsPanel farmerId={currentUser.id} />
      </section>
    </AppShell>
  );
}

function GlanceItem({ icon: Icon, tone, label, value, href, action }) {
  return (
    <div className="dashboard-glance-item">
      <span className={`dashboard-glance-icon ${tone}`}><Icon size={17} /></span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <Link to={href}>{action}</Link>
    </div>
  );
}

function SummaryLine({ label, value, tone = '' }) {
  return (
    <div className="dashboard-summary-line">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}
