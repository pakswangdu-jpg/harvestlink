import { useEffect, useState } from 'react';
import {
  BadgeAlert,
  Ban,
  BarChart3,
  Building2,
  Calendar,
  Check,
  Edit3,
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
import InfoRow from '../../components/common/InfoRow';
import FilePreviewCard from '../../components/common/FilePreviewCard';
import FormField from '../../components/common/FormField';
import { useAuth } from '../auth/AuthContext';
import { adminUpdateUserDetails, getUsers, setAccountStatus, setUserVerification } from '../../services/authService';
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
import { CEBU_MUNICIPALITIES, ORGANIZATION_TYPES } from '../../utils/constants';
import { formatCurrency, formatDate, getInitials } from '../../utils/formatters';
import { buildProfileDraft } from '../../utils/profileDraft';
import { hasErrors, validateProfileForm } from '../../utils/validators';
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

export default function AdminDashboard() {
  const { currentUser } = useAuth();
  const { pathname } = useLocation();
  const section = sectionFromPath(pathname);
  const users = getUsers();
  const products = getProducts();
  const orders = getOrders();
  const donations = getDonations();
  const pendingPriceReviews = getPendingPriceReviews();
  const pendingVerifications = users.filter((user) => user.verificationStatus === 'pending');
  const monthlySales = orders
    .filter((order) => order.paymentStatus === 'paid')
    .reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

  return (
    <AppShell
      user={currentUser}
      navItems={adminNavItems}
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
      {section === 'reports' ? <ReportsPlaceholder /> : null}
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
          { key: 'createdAt', label: 'Created', render: (row) => formatDate(row.createdAt) },
        ]}
        rows={users}
        emptyMessage="No registered users yet."
      />
    </section>
  );
}

function AdminUsersDetail() {
  const [users, setUsers] = useState(() => getUsers());
  const [selectedId, setSelectedId] = useState(null);
  const [notice, setNotice] = useState('');
  const selectedUser = users.find((user) => user.id === selectedId) || null;

  const reload = () => setUsers(getUsers());

  const handleVerify = (user, status) => {
    setUserVerification(user.id, status);
    setNotice(`${user.name}'s account was ${status === 'verified' ? 'verified' : 'rejected'}.`);
    reload();
  };

  const handleToggleAccountStatus = (user, status) => {
    setAccountStatus(user.id, status);
    setNotice(`${user.name}'s account was ${status === 'suspended' ? 'deactivated' : 'reactivated'}.`);
    reload();
  };

  const handleProfileSaved = (name) => {
    setNotice(`${name}'s details were updated.`);
    reload();
  };

  return (
    <section className="content-grid two uneven">
      <div className="panel">
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
            { key: 'createdAt', label: 'Created', render: (row) => formatDate(row.createdAt) },
            {
              key: 'actions',
              label: '',
              render: (row) => (
                <Button size="sm" variant={selectedId === row.id ? 'primary' : 'secondary'} onClick={() => setSelectedId(row.id)}>
                  View
                </Button>
              ),
            },
          ]}
          rows={users}
          emptyMessage="No registered users yet."
        />
      </div>

      <div className="panel">
        {selectedUser ? (
          <AdminUserDetailCard
            key={selectedUser.id}
            user={selectedUser}
            onVerify={handleVerify}
            onToggleAccountStatus={handleToggleAccountStatus}
            onProfileSaved={handleProfileSaved}
          />
        ) : (
          <EmptyState title="Select a user" message="Choose a user from the list to view their full account details." />
        )}
      </div>
    </section>
  );
}

function AdminUserDetailCard({ user, onVerify, onToggleAccountStatus, onProfileSaved }) {
  const isFarmer = user.role === 'farmer';
  const isStakeholder = user.role === 'stakeholder';
  const isSuspended = user.accountStatus === 'suspended';
  const idFile = isFarmer ? user.govIdFile : isStakeholder ? user.accreditationFile : null;
  const idLabel = isFarmer ? 'Proof of certification / government ID' : 'Proof of accreditation';

  const [isEditing, setIsEditing] = useState(false);
  const [profileDraft, setProfileDraft] = useState(() => buildProfileDraft(user));
  const [profileErrors, setProfileErrors] = useState({});

  const updateProfileField = (field, value) => {
    setProfileDraft((previous) => ({ ...previous, [field]: value }));
    setProfileErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const startEditing = () => {
    setProfileDraft(buildProfileDraft(user));
    setProfileErrors({});
    setIsEditing(true);
  };

  const handleProfileSubmit = (event) => {
    event.preventDefault();
    const nextErrors = validateProfileForm(profileDraft, user.role);
    if (hasErrors(nextErrors)) {
      setProfileErrors(nextErrors);
      return;
    }
    adminUpdateUserDetails(user.id, profileDraft);
    setIsEditing(false);
    onProfileSaved(user.name);
  };

  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">{user.role}</p>
          <h2>{user.name}</h2>
        </div>
        <div className="table-actions">
          <StatusBadge value={user.role} />
          {!isEditing ? (
            <Button size="sm" variant="secondary" onClick={startEditing}>
              <Edit3 size={15} /> Edit
            </Button>
          ) : null}
        </div>
      </div>

      {isEditing ? (
        <form className="form-stack" onSubmit={handleProfileSubmit}>
          <FormField label="Full name" name="name" error={profileErrors.name}>
            <input id="name" value={profileDraft.name} onChange={(event) => updateProfileField('name', event.target.value)} />
          </FormField>

          {isStakeholder ? (
            <>
              <FormField label="Organization name" name="organizationName" error={profileErrors.organizationName}>
                <input id="organizationName" value={profileDraft.organizationName} onChange={(event) => updateProfileField('organizationName', event.target.value)} />
              </FormField>
              <div className="form-grid">
                <FormField label="Organization type" name="organizationType" error={profileErrors.organizationType}>
                  <select id="organizationType" value={profileDraft.organizationType} onChange={(event) => updateProfileField('organizationType', event.target.value)}>
                    {ORGANIZATION_TYPES.map((type) => <option key={type}>{type}</option>)}
                  </select>
                </FormField>
                <FormField label="Contact person" name="contactPerson" error={profileErrors.contactPerson}>
                  <input id="contactPerson" value={profileDraft.contactPerson} onChange={(event) => updateProfileField('contactPerson', event.target.value)} />
                </FormField>
              </div>
            </>
          ) : (
            <FormField label="Contact number" name="contactNumber" error={profileErrors.contactNumber}>
              <input id="contactNumber" value={profileDraft.contactNumber} onChange={(event) => updateProfileField('contactNumber', event.target.value)} />
            </FormField>
          )}

          {isFarmer ? (
            <FormField label="Birthday" name="birthday" error={profileErrors.birthday}>
              <input id="birthday" type="date" value={profileDraft.birthday} onChange={(event) => updateProfileField('birthday', event.target.value)} />
            </FormField>
          ) : null}

          <FormField label={isFarmer ? 'Farm location' : 'Location'} name="municipality" error={profileErrors.municipality}>
            <select id="municipality" value={profileDraft.municipality} onChange={(event) => updateProfileField('municipality', event.target.value)}>
              {CEBU_MUNICIPALITIES.map((municipality) => <option key={municipality}>{municipality}</option>)}
            </select>
          </FormField>

          {isFarmer ? (
            <FormField label="Farm name" name="farmName" error={profileErrors.farmName}>
              <input id="farmName" value={profileDraft.farmName} onChange={(event) => updateProfileField('farmName', event.target.value)} />
            </FormField>
          ) : null}

          <div className="form-grid">
            <FormField label="Complete address" name="address" error={profileErrors.address}>
              <input id="address" value={profileDraft.address} onChange={(event) => updateProfileField('address', event.target.value)} />
            </FormField>
            <FormField label="Zip code" name="zipCode" error={profileErrors.zipCode}>
              <input id="zipCode" value={profileDraft.zipCode} onChange={(event) => updateProfileField('zipCode', event.target.value)} maxLength={4} />
            </FormField>
          </div>

          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
            <Button type="submit">Save changes</Button>
          </div>
        </form>
      ) : (
        <div className="info-grid">
          <InfoRow icon={Mail} label="Email" value={user.email} />
          {user.contactNumber ? <InfoRow icon={Phone} label="Contact number" value={user.contactNumber} /> : null}
          {user.municipality ? <InfoRow icon={MapPin} label={isFarmer ? 'Farm location' : 'Location'} value={user.municipality} /> : null}
          <InfoRow icon={Calendar} label="Member since" value={formatDate(user.createdAt)} />
          {isFarmer ? <InfoRow icon={Store} label="Farm name" value={user.farmName} /> : null}
          {isFarmer && user.birthday ? <InfoRow icon={Calendar} label="Birthday" value={formatDate(user.birthday)} /> : null}
          {isStakeholder ? <InfoRow icon={Building2} label="Organization" value={user.organizationName} /> : null}
          {isStakeholder ? <InfoRow icon={ShieldCheck} label="Organization type" value={user.organizationType} /> : null}
          {isStakeholder ? <InfoRow icon={UserSquare} label="Contact person" value={user.contactPerson} /> : null}
          <InfoRow icon={MapPin} label="Complete address" value={user.address} />
          <InfoRow icon={MapPin} label="Zip code" value={user.zipCode} />
        </div>
      )}

      {isFarmer || isStakeholder ? <FilePreviewCard label={idLabel} file={idFile} large /> : null}

      <div className="form-actions">
        <StatusBadge value={isSuspended ? 'Suspended' : 'Active'} />
        {isSuspended ? (
          <Button size="sm" onClick={() => onToggleAccountStatus(user, 'active')}>
            <RotateCcw size={15} /> Reactivate account
          </Button>
        ) : (
          <Button size="sm" variant="danger" onClick={() => onToggleAccountStatus(user, 'suspended')}>
            <Ban size={15} /> Deactivate account
          </Button>
        )}
      </div>

      {user.verificationStatus ? (
        <div className="form-actions">
          <StatusBadge value={user.verificationStatus} type="verification" />
          {user.verificationStatus === 'pending' ? (
            <>
              <Button size="sm" onClick={() => onVerify(user, 'verified')}>
                <Check size={15} /> Verify
              </Button>
              <Button size="sm" variant="danger" onClick={() => onVerify(user, 'rejected')}>
                <X size={15} /> Reject
              </Button>
            </>
          ) : null}
          {user.verificationStatus === 'rejected' ? (
            <Button size="sm" onClick={() => onVerify(user, 'verified')}>
              <RotateCcw size={15} /> Reactivate
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
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
          { key: 'createdAt', label: 'Created', render: (row) => formatDate(row.createdAt) },
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
          { key: 'pickupDate', label: 'Pickup', render: (row) => (row.pickupDate ? formatDate(row.pickupDate) : '—') },
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
  const [reviews, setReviews] = useState(() => getPendingPriceReviews());
  const [declined, setDeclined] = useState(() => getDeclinedPriceReviews());
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const reload = () => {
    setReviews(getPendingPriceReviews());
    setDeclined(getDeclinedPriceReviews());
  };

  const handleApprove = (product) => {
    approvePriceReview(product.id);
    setError('');
    setNotice(`${product.name}'s price was approved.`);
    reload();
  };

  const handleDecline = (product) => {
    declinePriceReview(product.id);
    setError('');
    setNotice(`${product.name}'s price was declined — the listing is hidden until the farmer revises it.`);
    reload();
  };

  const handleReactivate = (product) => {
    try {
      reactivatePriceReview(product.id);
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
              { key: 'decidedAt', label: 'Declined', render: (row) => formatDate(row.priceReview.decidedAt) },
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
            { key: 'sellingType', label: 'Selling type', render: (row) => (row.sellingType === 'bulk' ? `Bulk (min ${row.bulkMinQuantity || 0} ${row.unit})` : 'Retail') },
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

function ReportsPlaceholder() {
  return (
    <section className="panel">
      <EmptyState
        title="Reports placeholder"
        message="This section is reserved for future market, sales, product, and issue reports once a backend exists."
      />
    </section>
  );
}
