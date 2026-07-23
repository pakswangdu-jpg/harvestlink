import { useEffect, useState } from 'react';
import {
  BadgeAlert,
  Ban,
  BarChart3,
  Building2,
  Calendar,
  Check,
  Gift,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
  UserSquare,
  X,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import AppShell from '../../components/layout/AppShell';
import StatCard from '../../components/cards/StatCard';
import DataTable from '../../components/dashboard/DataTable';
import StatusBadge from '../../components/common/StatusBadge';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import SlideOver from '../../components/common/SlideOver';
import InfoRow from '../../components/common/InfoRow';
import InfoCard from '../../components/common/InfoCard';
import DocumentCard from '../../components/common/DocumentCard';
import DangerZone from '../../components/common/DangerZone';
import RevenueTrendChart from '../../components/charts/RevenueTrendChart';
import StatusDistributionChart from '../../components/charts/StatusDistributionChart';
import { useAuth } from '../auth/AuthContext';
import { getUsers, getVerificationDocuments, setAccountStatus, setUserVerification } from '../../services/authService';
import {
  approvePriceReview,
  declinePriceReview,
  getDeclinedPriceReviews,
  getPendingPriceReviews,
  getProducts,
  reactivatePriceReview,
} from '../../services/productService';
import { getOrders } from '../../services/orderService';
import { getDonations } from '../../services/donationService';
import {
  clearPriceOverride,
  fetchAnnualPriceTrend,
  getPriceOverride,
  MARKET_COMMODITIES,
  setPriceOverride,
} from '../../services/marketPriceService';
import {
  getDonationStatusBreakdown,
  getMonthlyRevenue,
  getOrderStatusBreakdown,
  getTopProducts,
  getTotalRevenue,
  getUserRoleBreakdown,
} from '../../services/reportService';
import { donationStatusLabel, formatCurrency, formatDate, getInitials } from '../../utils/formatters';
import { adminNavItems } from './adminNav';

function sectionFromPath(pathname) {
  if (pathname.includes('admin-users')) return 'users';
  if (pathname.includes('admin-price-monitoring')) return 'price-monitoring';
  if (pathname.includes('admin-orders')) return 'orders';
  if (pathname.includes('admin-donations')) return 'donations';
  if (pathname.includes('admin-reports')) return 'reports';
  if (pathname.includes('admin-profile')) return 'profile';
  return 'dashboard';
}

const EMPTY_STATE = { users: [], products: [], orders: [], donations: [], pendingPriceReviews: [] };

export default function AdminDashboard() {
  const { currentUser } = useAuth();
  const { pathname } = useLocation();
  const section = sectionFromPath(pathname);
  const [state, setState] = useState(EMPTY_STATE);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getUsers(), getProducts(), getOrders(), getPendingPriceReviews()]).then(([users, products, orders, pendingPriceReviews]) => {
      if (cancelled) return;
      // Donations haven't moved to the backend yet (see src/services/donationService.js) —
      // still a synchronous, localStorage-backed read, called alongside the async ones.
      setState({ users, products, orders, pendingPriceReviews, donations: getDonations() });
    });
    return () => {
      cancelled = true;
    };
  }, [section]);

  const { users, products, orders, donations, pendingPriceReviews } = state;
  const pendingVerifications = users.filter((user) => user.verificationStatus === 'pending');
  const monthlySales = orders
    .filter((order) => order.paymentStatus === 'paid')
    .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

  // Surfaces exactly the two queues that sit on the admin's own to-do list — new accounts
  // waiting on verification, and listings waiting on a fair-pricing decision — as a number
  // badge on their nav items, the same way NotificationBell flags unread messages. The other
  // sections (Orders/Donations/Reports/Profile) are monitoring views, not approval queues,
  // so they don't get one.
  const navItemsWithBadges = adminNavItems.map((item) => {
    if (item.to === '/admin-users') return { ...item, badge: pendingVerifications.length };
    if (item.to === '/admin-price-monitoring') return { ...item, badge: pendingPriceReviews.length };
    return item;
  });

  return (
    <AppShell
      user={currentUser}
      navItems={navItemsWithBadges}
      title="Admin dashboard"
      subtitle="Monitor HarvestLink activity across users, products, orders, and surplus donations."
    >
      {section === 'dashboard' ? (
        <>
          <section className="stats-grid">
            <StatCard label="Users" value={users.length} icon={<Users size={20} />} />
            <StatCard label="Products" value={products.length} icon={<ShoppingBag size={20} />} />
            <StatCard label="Orders" value={orders.length} icon={<BarChart3 size={20} />} />
            <StatCard label="Donations" value={donations.length} icon={<Gift size={20} />} />
          </section>
          {pendingVerifications.length ? (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">DTI oversight</p>
                  <h2><BadgeAlert size={18} /> {pendingVerifications.length} account{pendingVerifications.length === 1 ? '' : 's'} awaiting verification</h2>
                </div>
                <Link className="btn btn-secondary btn-md" to="/admin-users">Review now</Link>
              </div>
            </section>
          ) : null}
          {pendingPriceReviews.length ? (
            <section className="panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">DTI oversight</p>
                  <h2><BadgeAlert size={18} /> {pendingPriceReviews.length} price review{pendingPriceReviews.length === 1 ? '' : 's'} pending</h2>
                </div>
                <Link className="btn btn-secondary btn-md" to="/admin-price-monitoring">Review now</Link>
              </div>
            </section>
          ) : null}
          <section className="content-grid two">
            <AdminUsers users={users.slice(0, 5)} />
            <AdminOrders orders={orders.slice(0, 5)} />
          </section>
          <section className="panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Revenue</p>
                <h2>Paid order value</h2>
              </div>
              <strong>{formatCurrency(monthlySales)}</strong>
            </div>
          </section>
        </>
      ) : null}
      {section === 'users' ? <AdminUsersDetail /> : null}
      {section === 'price-monitoring' ? <AdminPriceMonitoring products={products} /> : null}
      {section === 'orders' ? <AdminOrders orders={orders} /> : null}
      {section === 'donations' ? <AdminDonations donations={donations} /> : null}
      {section === 'reports' ? <AdminReports users={users} orders={orders} donations={donations} /> : null}
      {section === 'profile' ? <AdminProfile user={currentUser} /> : null}
    </AppShell>
  );
}

function AdminUsers({ users }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Users</p>
          <h2>Registered accounts</h2>
        </div>
      </div>
      <DataTable
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'email', label: 'Email' },
          { key: 'role', label: 'Role', render: (row) => <StatusBadge value={row.role} /> },
          { key: 'verificationStatus', label: 'Verification', render: (row) => (row.verificationStatus ? <StatusBadge value={row.verificationStatus} type="verification" /> : '—') },
          { key: 'accountStatus', label: 'Account', render: (row) => <StatusBadge value={row.accountStatus === 'suspended' ? 'Suspended' : 'Active'} /> },
          { key: 'createdAt', label: 'Created', render: (row) => <span className="muted">{formatDate(row.createdAt)}</span> },
        ]}
        rows={users}
        emptyMessage="No registered users yet."
      />
    </section>
  );
}

function AdminUsersDetail() {
  const [users, setUsers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState('');
  const selectedUser = users.find((user) => user.id === selectedId) || null;

  const reload = () => getUsers().then(setUsers);

  useEffect(() => {
    reload();
  }, []);

  const handleVerify = async (user, status) => {
    await setUserVerification(user.id, status);
    setNotice(`${user.name}'s account was ${status === 'verified' ? 'verified' : 'rejected'}.`);
    reload();
  };

  const handleToggleAccountStatus = async (user, status) => {
    await setAccountStatus(user.id, status);
    setNotice(`${user.name}'s account was ${status === 'suspended' ? 'deactivated' : 'reactivated'}.`);
    reload();
  };

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Users</p>
          <h2>Registered accounts</h2>
        </div>
      </div>
      {notice ? <div className="form-alert success">{notice}</div> : null}
      <DataTable
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'role', label: 'Role', render: (row) => <StatusBadge value={row.role} /> },
          { key: 'verificationStatus', label: 'Verification', render: (row) => (row.verificationStatus ? <StatusBadge value={row.verificationStatus} type="verification" /> : '—') },
          { key: 'accountStatus', label: 'Account', render: (row) => <StatusBadge value={row.accountStatus === 'suspended' ? 'Suspended' : 'Active'} /> },
          { key: 'createdAt', label: 'Created', render: (row) => <span className="muted">{formatDate(row.createdAt)}</span> },
          {
            key: 'actions',
            label: '',
            render: (row) => (
              <Button size="sm" variant="secondary" onClick={() => setSelectedId(row.id)}>
                View
              </Button>
            ),
          },
        ]}
        rows={users}
        emptyMessage="No registered users yet."
      />

      <SlideOver open={Boolean(selectedUser)} onClose={() => setSelectedId(null)} eyebrow={selectedUser?.role} title={selectedUser?.name}>
        {selectedUser ? (
          <AdminUserDetailCard
            key={selectedUser.id}
            user={selectedUser}
            onVerify={handleVerify}
            onToggleAccountStatus={handleToggleAccountStatus}
          />
        ) : null}
      </SlideOver>
    </section>
  );
}

function AdminUserDetailCard({ user, onVerify, onToggleAccountStatus }) {
  const isFarmer = user.role === 'farmer';
  const isStakeholder = user.role === 'stakeholder';
  const isSuspended = user.accountStatus === 'suspended';
  const idFile = isFarmer ? user.govIdFile : isStakeholder ? user.accreditationFile : null;
  const idLabel = isFarmer ? 'Proof of certification / government ID' : 'Proof of accreditation';

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge value={user.role} />
        <StatusBadge value={isSuspended ? 'Suspended' : 'Active'} />
        {user.verificationStatus ? <StatusBadge value={user.verificationStatus} type="verification" /> : null}
      </div>

      <div>
        <h3 className="mb-4 text-[18px] font-semibold text-gray-900">Personal Information</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InfoCard icon={Mail} label="Email" value={user.email} />
          {user.contactNumber ? <InfoCard icon={Phone} label="Contact Number" value={user.contactNumber} /> : null}
          {user.municipality ? <InfoCard icon={MapPin} label={isFarmer ? 'Farm Location' : 'Location'} value={user.municipality} /> : null}
          <InfoCard icon={Calendar} label="Member Since" value={formatDate(user.createdAt)} />
          {isFarmer ? <InfoCard icon={Store} label="Farm Name" value={user.farmName} /> : null}
          {isFarmer && user.birthday ? <InfoCard icon={Calendar} label="Birthday" value={formatDate(user.birthday)} /> : null}
          {isStakeholder ? <InfoCard icon={Building2} label="Organization" value={user.organizationName} /> : null}
          {isStakeholder ? <InfoCard icon={ShieldCheck} label="Organization Type" value={user.organizationType} /> : null}
          {isStakeholder ? <InfoCard icon={UserSquare} label="Contact Person" value={user.contactPerson} /> : null}
          <InfoCard icon={MapPin} label="Complete Address" value={user.address} />
          <InfoCard icon={MapPin} label="ZIP Code" value={user.zipCode} />
        </div>
      </div>

      {isFarmer || isStakeholder ? (
        <div>
          <h3 className="mb-4 text-[18px] font-semibold text-gray-900">Verification Document</h3>
          <DocumentCard
            label={idLabel}
            file={idFile}
            resolveUrl={async () => {
              const urls = await getVerificationDocuments(user.id);
              return isFarmer ? urls.govIdFile : urls.accreditationFile;
            }}
          />
        </div>
      ) : null}

      {user.verificationStatus === 'pending' || user.verificationStatus === 'rejected' ? (
        <div>
          <h3 className="mb-3 text-[18px] font-semibold text-gray-900">Verification</h3>
          <div className="flex flex-wrap gap-2.5">
            {user.verificationStatus === 'pending' ? (
              <>
                <Button size="sm" onClick={() => onVerify(user, 'verified')}>
                  <Check size={15} /> Verify Account
                </Button>
                <Button size="sm" variant="danger" onClick={() => onVerify(user, 'rejected')}>
                  <X size={15} /> Reject
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => onVerify(user, 'verified')}>
                <RotateCcw size={15} /> Reactivate Verification
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {isSuspended ? (
        <div>
          <h3 className="mb-3 text-[18px] font-semibold text-gray-900">Account Actions</h3>
          <Button size="sm" onClick={() => onToggleAccountStatus(user, 'active')}>
            <RotateCcw size={15} /> Reactivate Account
          </Button>
        </div>
      ) : (
        <DangerZone>
          <Button size="sm" variant="danger" onClick={() => onToggleAccountStatus(user, 'suspended')}>
            <Ban size={15} /> Deactivate Account
          </Button>
        </DangerZone>
      )}
    </div>
  );
}

function AdminOrders({ orders }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Orders</p>
          <h2>Purchase orders</h2>
        </div>
      </div>
      <DataTable
        columns={[
          { key: 'buyerName', label: 'Buyer' },
          { key: 'productName', label: 'Product' },
          { key: 'quantity', label: 'Qty' },
          { key: 'paymentMethod', label: 'Payment', render: (row) => <StatusBadge value={row.paymentMethod} type="payment" /> },
          { key: 'paymentStatus', label: 'Payment status', render: (row) => <StatusBadge value={row.paymentStatus} type="paymentStatus" /> },
          { key: 'deliveryStatus', label: 'Delivery', render: (row) => <StatusBadge value={row.deliveryStatus} type="deliveryStatus" /> },
          { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
          { key: 'createdAt', label: 'Created', render: (row) => <span className="muted">{formatDate(row.createdAt)}</span> },
        ]}
        rows={orders}
        emptyMessage="No orders yet."
      />
    </section>
  );
}

function AdminDonations({ donations }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Donations</p>
          <h2>Surplus donation lifecycle</h2>
        </div>
      </div>
      <DataTable
        columns={[
          { key: 'productName', label: 'Product' },
          { key: 'farmerName', label: 'Farmer' },
          { key: 'quantity', label: 'Qty', render: (row) => `${row.quantity} ${row.unit}` },
          { key: 'requestedByName', label: 'Organization', render: (row) => row.requestedByName || '—' },
          { key: 'pickupDate', label: 'Pickup', render: (row) => <span className="muted">{row.pickupDate ? formatDate(row.pickupDate) : '—'}</span> },
          { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} type="donation" /> },
        ]}
        rows={donations}
        emptyMessage="No donations yet."
      />
    </section>
  );
}

function AdminReferencePrices() {
  const [referenceData, setReferenceData] = useState({});
  const [drafts, setDrafts] = useState({});
  const [notice, setNotice] = useState('');

  const loadCommodity = async (commodity) => {
    try {
      const points = await fetchAnnualPriceTrend(commodity.id, 3);
      const latest = [...points].reverse().find((point) => point.price != null);
      setReferenceData((previous) => ({
        ...previous,
        [commodity.id]: {
          price: latest?.price ?? null,
          year: latest?.year ?? null,
          override: getPriceOverride(commodity.id),
        },
      }));
    } catch {
      // The PSA service itself is unreachable (network/CORS/downtime) — an override still
      // has to surface here, since "PSA is down" is exactly when admins rely on it most.
      const override = getPriceOverride(commodity.id);
      setReferenceData((previous) => ({
        ...previous,
        [commodity.id]: { price: override?.referencePrice ?? null, year: override?.referenceYear ?? null, override },
      }));
    }
  };

  // Requests run one at a time rather than all 30 at once: firing them concurrently gets
  // a large fraction Cloudflare-rate-limited, even though each request works fine in
  // isolation — a strictly sequential load keeps this from ever reading as a burst.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const commodity of MARKET_COMMODITIES) {
        if (cancelled) return;
        await loadCommodity(commodity);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async (commodity) => {
    const draft = drafts[commodity.id];
    const value = Number(draft);
    if (!draft || !Number.isFinite(value) || value <= 0) return;

    await setPriceOverride(commodity.id, value);
    setNotice(`${commodity.label} reference price set to ${formatCurrency(value)}/kg.`);
    setDrafts((previous) => ({ ...previous, [commodity.id]: '' }));
    loadCommodity(commodity);
  };

  const handleReset = (commodity) => {
    clearPriceOverride(commodity.id);
    setNotice(`${commodity.label} reference price reset to PSA data.`);
    loadCommodity(commodity);
  };

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">DTI oversight</p>
          <h2>PSA reference prices</h2>
        </div>
      </div>
      {notice ? <div className="form-alert success">{notice}</div> : null}
      <DataTable
        columns={[
          { key: 'label', label: 'Commodity' },
          {
            key: 'current',
            label: 'Reference price',
            render: (row) => {
              const info = referenceData[row.id];
              if (!info) return 'Loading…';
              if (info.price == null) return 'No data';
              return `${formatCurrency(info.price)} / kg (${info.year})`;
            },
          },
          {
            key: 'source',
            label: 'Source',
            render: (row) => {
              const info = referenceData[row.id];
              if (!info) return '—';
              return info.override ? 'DTI override' : 'PSA OpenStat';
            },
          },
          {
            key: 'override',
            label: 'Set override',
            render: (row) => (
              <div className="table-actions">
                <input
                  className="reference-price-input"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="₱/kg"
                  value={drafts[row.id] ?? ''}
                  onChange={(event) => setDrafts((previous) => ({ ...previous, [row.id]: event.target.value }))}
                />
                <Button size="sm" onClick={() => handleSave(row)}>Save</Button>
                {referenceData[row.id]?.override ? (
                  <Button size="sm" variant="secondary" onClick={() => handleReset(row)}>
                    <RotateCcw size={15} /> Reset
                  </Button>
                ) : null}
              </div>
            ),
          },
        ]}
        rows={MARKET_COMMODITIES}
        emptyMessage="No commodities tracked."
      />
    </section>
  );
}

function AdminPriceMonitoring({ products }) {
  const [reviews, setReviews] = useState([]);
  const [declined, setDeclined] = useState([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const reload = () => {
    getPendingPriceReviews().then(setReviews);
    getDeclinedPriceReviews().then(setDeclined);
  };

  useEffect(() => {
    reload();
  }, []);

  const handleApprove = async (product) => {
    await approvePriceReview(product.id);
    setError('');
    setNotice(`${product.name}'s price was approved.`);
    reload();
  };

  const handleDecline = async (product) => {
    await declinePriceReview(product.id);
    setError('');
    setNotice(`${product.name}'s price was declined — the listing is hidden until the farmer revises it.`);
    reload();
  };

  const handleReactivate = async (product) => {
    try {
      await reactivatePriceReview(product.id);
      setError('');
      setNotice(`${product.name}'s listing was reactivated.`);
      reload();
    } catch (reactivateError) {
      setNotice('');
      setError(reactivateError.message);
    }
  };

  return (
    <>
      <AdminReferencePrices />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">DTI oversight</p>
            <h2>Pending price reviews</h2>
          </div>
        </div>
        {notice ? <div className="form-alert success">{notice}</div> : null}
        {error ? <div className="form-alert error">{error}</div> : null}
        {reviews.length ? (
          <DataTable
            columns={[
              { key: 'name', label: 'Product' },
              { key: 'farmerName', label: 'Farmer' },
              { key: 'farmerPrice', label: 'Listed price', render: (row) => `${formatCurrency(row.priceReview.farmerPrice)} / ${row.unit}` },
              { key: 'referencePrice', label: 'PSA reference', render: (row) => `${formatCurrency(row.priceReview.referencePrice)} (${row.priceReview.referenceYear})` },
              { key: 'deviationPct', label: 'Deviation', render: (row) => `+${row.priceReview.deviationPct}%` },
              { key: 'reason', label: 'Reason', render: (row) => <span className="price-review-reason">{row.priceReview.reason}</span> },
              {
                key: 'actions',
                label: 'Action',
                render: (row) => (
                  <div className="table-actions">
                    <Button size="sm" onClick={() => handleApprove(row)}>
                      <Check size={15} /> Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => handleDecline(row)}>
                      <X size={15} /> Decline
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={reviews}
            emptyMessage="No pending price reviews."
          />
        ) : (
          <EmptyState title="No pending price reviews" message="Products priced well above the PSA regional reference will appear here for review." />
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">DTI oversight</p>
            <h2>Declined listings</h2>
          </div>
        </div>
        {declined.length ? (
          <DataTable
            columns={[
              { key: 'name', label: 'Product' },
              { key: 'farmerName', label: 'Farmer' },
              { key: 'farmerPrice', label: 'Listed price', render: (row) => `${formatCurrency(row.priceReview.farmerPrice)} / ${row.unit}` },
              { key: 'referencePrice', label: 'PSA reference', render: (row) => `${formatCurrency(row.priceReview.referencePrice)} (${row.priceReview.referenceYear})` },
              { key: 'decidedAt', label: 'Declined', render: (row) => <span className="muted">{formatDate(row.priceReview.decidedAt)}</span> },
              {
                key: 'actions',
                label: 'Action',
                render: (row) => (
                  <div className="table-actions">
                    <Button size="sm" onClick={() => handleReactivate(row)}>
                      <RotateCcw size={15} /> Reactivate
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={declined}
            emptyMessage="No declined listings."
          />
        ) : (
          <EmptyState title="No declined listings" message="Listings DTI has declined will appear here, with an option to reactivate them." />
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Products</p>
            <h2>Marketplace listings</h2>
          </div>
        </div>
        <DataTable
          columns={[
            { key: 'name', label: 'Product' },
            { key: 'farmerName', label: 'Farmer' },
            { key: 'grade', label: 'Grade', render: (row) => `Grade ${row.grade || 'A'}` },
            { key: 'sellingType', label: 'Sales type', render: (row) => (row.sellingType === 'wholesale' ? `Wholesale (MOQ ${row.moq || 0} ${row.unit})` : 'Retail') },
            { key: 'price', label: 'Price', render: (row) => `${formatCurrency(row.price)} / ${row.unit}` },
            { key: 'quantity', label: 'Available', render: (row) => `${row.quantity} ${row.unit}` },
            { key: 'status', label: 'Status', render: (row) => <StatusBadge value={row.status} /> },
          ]}
          rows={products}
          emptyMessage="No products yet."
        />
      </section>
    </>
  );
}

function AdminProfile({ user }) {
  return (
    <>
      <section className="panel profile-header">
        <div className="profile-banner" />
        <div className="profile-identity">
          <div className="profile-avatar-lg">{getInitials(user.name)}</div>
          <div className="profile-identity-text">
            <h2>{user.name}</h2>
            <span className="profile-email"><Mail size={14} /> {user.email}</span>
          </div>
          <div className="profile-badges">
            <StatusBadge value={user.role} />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Personal</p>
            <h2>Account information</h2>
          </div>
        </div>
        <div className="info-grid">
          <InfoRow icon={Mail} label="Email" value={user.email} />
          <InfoRow icon={Calendar} label="Member since" value={formatDate(user.createdAt)} />
        </div>
      </section>
    </>
  );
}

function AdminReports({ users, orders, donations }) {
  const totalRevenue = getTotalRevenue(orders);
  const monthlyRevenue = getMonthlyRevenue(orders, 6);
  const topProducts = getTopProducts(orders, 5);
  const completedDonations = donations.filter((donation) => donation.status === 'completed').length;

  return (
    <>
      <section className="stats-grid">
        <StatCard label="Total Sales" value={formatCurrency(totalRevenue)} icon={<BarChart3 size={20} />} />
        <StatCard label="Total orders" value={orders.length} icon={<ShoppingBag size={20} />} />
        <StatCard label="Registered users" value={users.length} icon={<Users size={20} />} />
        <StatCard label="Donations completed" value={completedDonations} icon={<Gift size={20} />} />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Sales</p>
            <h2>Revenue — last 6 months</h2>
          </div>
        </div>
        <RevenueTrendChart points={monthlyRevenue} />
      </section>

      <section className="content-grid two">
        <StatusDistributionChart
          eyebrow="Issues"
          title="Orders by status"
          records={orders}
          computeBreakdown={(filteredOrders) => getOrderStatusBreakdown(filteredOrders).map((entry) => ({
            key: entry.status,
            status: entry.status,
            label: entry.status.charAt(0).toUpperCase() + entry.status.slice(1),
            count: entry.count,
          }))}
        />

        <StatusDistributionChart
          eyebrow="Surplus"
          title="Donations by status"
          records={donations}
          computeBreakdown={(filteredDonations) => getDonationStatusBreakdown(filteredDonations).map((entry) => ({
            key: entry.status,
            status: entry.status,
            label: donationStatusLabel(entry.status),
            count: entry.count,
          }))}
        />
      </section>

      <section className="content-grid two uneven">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Product</p>
              <h2>Top products by revenue</h2>
            </div>
          </div>
          {topProducts.length ? (
            <DataTable
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
        </div>

        <StatusDistributionChart
          eyebrow="Market"
          title="Users by role"
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
      </section>
    </>
  );
}
