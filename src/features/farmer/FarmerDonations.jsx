import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Gift, History, Hourglass, Package, PackageCheck, Search, Truck,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
import Modal from '../../components/admin/Modal';
import { Card, CardHeader } from '../../components/admin/Card';
import StatCard from '../../components/admin/StatCard';
import EmptyState from '../../components/admin/EmptyState';
import Table from '../../components/admin/Table';
import Badge from '../../components/admin/Badge';
import Input from '../../components/admin/Input';
import Select from '../../components/admin/Select';
import { usePagination } from '../../components/admin/usePagination';
import Pagination from '../../components/admin/Pagination';
import { donationTone } from '../../components/admin/statusTone';
import { useAuth } from '../auth/AuthContext';
import {
  acceptDonationRequest,
  confirmDonationHandover,
  rejectDonationClaim,
  scheduleDonationClaim,
  cancelDonation,
  declineDonationRequest,
  createDonation,
} from '../../services/donationService';
import DonationPickupTrackingModal, {
  DonationHandoverConfirmModal,
} from '../../components/orders/DonationPickupTrackingModal';
import {
  canFarmerConfirmDonationHandover,
  getDonationWorkflowLabel,
  isDonationArrivalVerified,
  resolveDonationPickupStatus,
} from '../../utils/donationWorkflow';
import { useDonationList } from '../../hooks/useDonationList';
import {
  donationStatusLabel, formatDate, formatDateTimeManila, formatQuantity, formatRelativeTime,
} from '../../utils/formatters';
import { farmerNavItems } from './farmerNav';
import donateMapPin from '../../assets/icons/donate-map-pin.png';

const HISTORY_STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'rejected', label: 'Rejected claims' },
  { value: 'expired', label: 'Expired' },
];

function getDonationDraft() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return {
    expirationDate: `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`,
    expirationTime: '17:00',
  };
}



function buildRecentActivity(donations) {
  return donations
    .map((donation) => {
      if (donation.status === 'requested') {
        return { id: donation.id, message: `${donation.requestedByName} requested ${donation.productName}`, at: donation.updatedAt };
      }
      if (donation.status === 'scheduled') {
        return { id: donation.id, message: `Pickup scheduled for ${donation.productName} on ${formatDate(donation.pickupDate)}`, at: donation.updatedAt };
      }
      if (donation.status === 'completed') {
        return { id: donation.id, message: `${donation.requestedByName || 'Partner organization'} completed pickup of ${donation.productName}`, at: donation.updatedAt };
      }
      if (donation.status === 'cancelled') {
        return { id: donation.id, message: `Donation of ${donation.productName} was cancelled`, at: donation.updatedAt };
      }
      if (donation.status === 'rejected') {
        return { id: donation.claimId || donation.id, message: `${donation.requestedByName || 'Partner organization'} claim for ${donation.productName} was declined`, at: donation.updatedAt };
      }
      if (donation.status === 'expired') {
        return { id: donation.id, message: `${donation.productName} donation expired`, at: donation.updatedAt };
      }
      return { id: donation.id, message: `Listed ${donation.productName} (${formatQuantity(donation.quantity)} ${donation.unit}) as a donation offer`, at: donation.createdAt };
    })
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 6);
}





function DonationRow({ donation, meta, badge, actions }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--line)] px-3 py-2.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--green-50)] text-[var(--green-800)]">
        {donation.image ? <img src={donation.image} alt="" className="h-full w-full object-cover" /> : <Package size={18} strokeWidth={1.75} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 break-words text-[13px] font-medium text-[var(--text)]">
          {donation.productName}
          {badge}
        </p>
        <p className="whitespace-normal break-words text-[12px] text-[var(--muted)]">{meta}</p>
      </div>
      {actions ? (
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

function PendingDonationRequestRow({ donation, onViewDetails }) {
  return (
    <article className="farmer-donation-request-row">
      <div className="farmer-donation-request-info">
        <div className="farmer-donation-request-image">
          {donation.image ? <img src={donation.image} alt="" /> : <Package size={18} strokeWidth={1.75} />}
        </div>
        <div className="farmer-donation-request-copy">
          <p className="farmer-donation-request-product">{donation.productName}</p>
          <p>{formatQuantity(donation.quantity)} {donation.unit} · Requested by {donation.requestedByName || 'Partner organization'}</p>
          <p>Requested {formatDate(donation.updatedAt)}</p>
        </div>
      </div>
      <div className="farmer-donation-request-actions">
        <Button size="sm" variant="secondary" onClick={() => onViewDetails(donation)}>View details</Button>
        <Button size="sm" onClick={() => onViewDetails(donation)}>Accept</Button>
        <Button size="sm" variant="danger" onClick={() => onViewDetails(donation)}>Decline</Button>
      </div>
    </article>
  );
}

export default function FarmerDonations() {
  const { currentUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { donations, loading, loadError, reload } = useDonationList({ farmerId: currentUser.id });
  const [pickupDrafts, setPickupDrafts] = useState({});
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [requestStage, setRequestStage] = useState('details');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('all');
  const [donationProduct, setDonationProduct] = useState(() => location.state?.donationProduct || null);
  const [donationDraft, setDonationDraft] = useState(getDonationDraft);
  const [trackingTarget, setTrackingTarget] = useState(null);
  const [confirmHandoverTarget, setConfirmHandoverTarget] = useState(null);

  useEffect(() => {
    if (!location.state?.donationProduct) return;
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  const run = async (action, successMessage) => {
    if (saving) return false;
    setSaving(true);
    try {
      await action();
      setError('');
      setNotice(successMessage);
      await reload();
      return true;
    } catch (actionError) {
      setNotice('');
      setError(actionError.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openRequest = (donation, stage = 'details') => {
    setSelectedRequest(donation);
    setRequestStage(stage);
    setError('');
  };

  const acceptRequest = async () => {
    if (!selectedRequest) return;
    const requestKey = selectedRequest.claimId || selectedRequest.id;
    const accepted = await run(
      () => selectedRequest.claimId
        ? scheduleDonationClaim(selectedRequest.claimId, pickupDrafts[requestKey] || selectedRequest.pickupDate)
        : acceptDonationRequest(selectedRequest.id, pickupDrafts[requestKey] || selectedRequest.pickupDate),
      'Pickup scheduled.',
    );
    if (accepted) setSelectedRequest(null);
  };

  const declineRequest = async () => {
    if (!selectedRequest) return;
    const declined = await run(
      () => selectedRequest.claimId ? rejectDonationClaim(selectedRequest.claimId) : declineDonationRequest(selectedRequest.id),
      'Request declined.',
    );
    if (declined) setSelectedRequest(null);
  };

  const closeDonationComposer = () => {
    if (!saving) setDonationProduct(null);
  };

  const createDonationOffer = async (event) => {
    event.preventDefault();
    if (!donationProduct || !donationDraft.expirationDate || !donationDraft.expirationTime) return;

    const expirationAt = new Date(
      `${donationDraft.expirationDate}T${donationDraft.expirationTime}:00+08:00`,
    ).toISOString();
    const created = await run(
      () => createDonation(donationProduct, expirationAt),
      `${donationProduct.name} is now available to partner organizations.`,
    );
    if (created) setDonationProduct(null);
  };

  const today = new Date();
  const minPickupDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const requestPickupDate = selectedRequest
    ? pickupDrafts[selectedRequest.claimId || selectedRequest.id] || selectedRequest.pickupDate || ''
    : '';

  const claimRows = useMemo(() => donations.flatMap((donation) => (donation.claims || []).map((claim) => ({
    ...donation,
    id: donation.id,
    claimId: claim.id,
    claimObj: claim,
    status: claim.status,
    pickupStatus: claim.pickupStatus,
    quantity: claim.quantity,
    requestedById: claim.stakeholderId,
    requestedByName: claim.stakeholderName,
    pickupDate: claim.pickupDate,
    currentLat: claim.currentLat,
    currentLng: claim.currentLng,
    currentAccuracy: claim.currentAccuracy,
    currentHeading: claim.currentHeading,
    currentSpeed: claim.currentSpeed,
    locationUpdatedAt: claim.locationUpdatedAt,
    transitStartedAt: claim.transitStartedAt,
    consecutiveArrivalReadings: claim.consecutiveArrivalReadings,
    arrivedAt: claim.arrivedAt,
    arrivalNotifiedAt: claim.arrivalNotifiedAt,
    confirmedAt: claim.confirmedAt,
    updatedAt: claim.updatedAt,
  }))), [donations]);
  const requested = [
    ...donations.filter((donation) => donation.status === 'requested'),
    ...claimRows.filter((claim) => claim.status === 'pending'),
  ];
  const scheduled = [
    ...donations.filter((donation) => donation.status === 'scheduled'),
    ...claimRows.filter((claim) => claim.status === 'scheduled'),
  ];
  const available = donations.filter((donation) => donation.status === 'available'
    && Number(donation.availableQuantity ?? donation.quantity) > 0);
  const history = useMemo(() => [
    ...donations.filter((donation) => ['completed', 'cancelled', 'expired'].includes(donation.status)),
    ...claimRows.filter((claim) => ['completed', 'cancelled', 'rejected', 'expired'].includes(claim.status)),
  ], [donations, claimRows]);

  const now = new Date();
  const thisMonthCount = donations.filter((donation) => {
    const created = new Date(donation.createdAt);
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthCount = donations.filter((donation) => {
    const created = new Date(donation.createdAt);
    return created.getMonth() === lastMonthDate.getMonth() && created.getFullYear() === lastMonthDate.getFullYear();
  }).length;
  const monthTrend = lastMonthCount > 0
    ? { direction: thisMonthCount >= lastMonthCount ? 'up' : 'down', label: `${Math.round(((thisMonthCount - lastMonthCount) / lastMonthCount) * 100)}% vs last month` }
    : undefined;

  const recentActivity = useMemo(() => buildRecentActivity([...donations, ...claimRows]), [donations, claimRows]);

  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    return history.filter((donation) => {
      if (historyStatus !== 'all' && donation.status !== historyStatus) return false;
      if (!query) return true;
      return (
        donation.productName.toLowerCase().includes(query)
        || (donation.requestedByName || '').toLowerCase().includes(query)
        || donation.id.toLowerCase().includes(query)
      );
    });
  }, [history, historySearch, historyStatus]);
  const { page, setPage, pageRows, pageSize, total } = usePagination(filteredHistory, 8);

  return (
    <AppShell
      user={currentUser}
      navItems={farmerNavItems}
      title="Surplus donations"
      subtitle="Manage donation offers, respond to partner organization requests, and track pickups."
      pageClassName="farmer-donations-page"
      headerActions={(
        <div className="donation-page-actions flex items-center gap-2">
          <span className="hidden sm:inline-flex">
            <button
              type="button"
              onClick={() => document.getElementById('donation-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="btn btn-ghost btn-sm"
            >
              View Donation History
            </button>
          </span>
          <Link to="/farmer-products" className="btn btn-primary btn-sm">Create Donation Offer</Link>
        </div>
      )}
    >
      {notice ? <div className="form-alert success">{notice}</div> : null}
      {error ? <div className="form-alert error">{error}</div> : null}
      {loadError ? <div className="form-alert error" role="alert">{loadError}</div> : null}
      {loading ? <p role="status">Loading donations...</p> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active donation offers" value={available.length} icon={Gift} tone="green" hint="Listed and unclaimed" />
        <StatCard label="Pending requests" value={requested.length} icon={Hourglass} tone="amber" hint="Awaiting your response" iconClassName="stat-icon-waiting" />
        <StatCard label="Scheduled pickups" value={scheduled.length} icon={Truck} tone="blue" hint="Confirmed with a pickup date" />
        <StatCard label="Donations this month" value={thisMonthCount} icon={PackageCheck} tone="violet" trend={monthTrend} hint={monthTrend ? undefined : 'Offers created this month'} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
          <CardHeader eyebrow="Action needed" title="Pending requests" />
          {requested.length ? (
            <div className="farmer-donation-requests">
              {requested.map((donation) => (
                <PendingDonationRequestRow key={donation.claimId || donation.id} donation={donation} onViewDetails={openRequest} />
              ))}
            </div>
          ) : (
            <EmptyState compact icon={Hourglass} iconClassName="empty-icon-waiting" title="No pending requests" message="You currently have no donation requests from partner organizations." />
          )}
        </Card>

        <Card className="shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
          <CardHeader eyebrow="Waiting" title="Available donation offers" />
          {available.length ? (
            <div className="grid gap-2.5">
              {available.map((donation) => (
                <DonationRow
                  key={donation.claimId || donation.id}
                  donation={donation}
                  meta={`${formatQuantity(donation.availableQuantity ?? donation.quantity)} ${donation.unit} · ${donation.location}`}
                  actions={(
                    <Button size="sm" disabled={saving || donation.claims?.some((claim) => ['pending', 'scheduled'].includes(claim.status))} variant="secondary" onClick={() => run(() => cancelDonation(donation.id), 'Donation withdrawn.')}>
                      Withdraw
                    </Button>
                  )}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              icon={Gift}
              title="No active donation offers"
              message="List surplus stock from your products to reach partner organizations."
              action={<Link to="/farmer-products" className="btn btn-secondary btn-sm">List surplus stock</Link>}
            />
          )}
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
          <CardHeader eyebrow="Upcoming" title="Scheduled pickups" />
          {scheduled.length ? (
            <div className="grid gap-2.5">
              {scheduled.map((donation) => {
                const workflowStatus = resolveDonationPickupStatus(donation);
                const workflowLabel = getDonationWorkflowLabel(donation);
                const arrivalVerified = isDonationArrivalVerified(donation) || Boolean(donation.arrivalNotifiedAt);
                const canConfirm = canFarmerConfirmDonationHandover(donation);
                return (
                  <DonationRow
                    key={donation.claimId || donation.id}
                    donation={donation}
                    badge={<Badge tone={donationTone(workflowStatus)}>{workflowLabel}</Badge>}
                    meta={`${formatQuantity(donation.quantity)} ${donation.unit} · ${donation.requestedByName || 'Stakeholder'} · Pickup ${formatDate(donation.pickupDate)}${arrivalVerified ? ' · Stakeholder Has Arrived' : ''}`}
                    actions={(
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setTrackingTarget(donation)}
                        >
                          Track Pickup
                        </Button>
                        <Button
                          size="sm"
                          disabled={saving || !canConfirm}
                          title={canConfirm ? 'Confirm the donation handover' : 'Available after the Stakeholder arrival is verified'}
                          onClick={() => {
                            setError('');
                            setConfirmHandoverTarget(donation);
                          }}
                        >
                          Confirm Donation
                        </Button>
                        {donation.claimId ? null : (
                          <Button size="sm" disabled={saving} variant="secondary" onClick={() => run(() => cancelDonation(donation.id), 'Donation cancelled.')}>
                            Cancel
                          </Button>
                        )}
                      </>
                    )}
                  />
                );
              })}
            </div>
          ) : (
            <EmptyState compact icon={Truck} title="No scheduled pickups" message="Accepted donation requests will show their pickup date here." />
          )}
        </Card>

        <Card className="shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
          <CardHeader eyebrow="Activity" title="Recent activity" />
          {recentActivity.length ? (
            <ul className="flex flex-col gap-3">
              {recentActivity.map((event) => (
                <li key={`${event.id}-${event.at}`} className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-3 last:border-0 last:pb-0">
                  <p className="text-[13px] text-[var(--text)]">{event.message}</p>
                  <span className="shrink-0 whitespace-nowrap text-[12px] text-[var(--muted)]">{formatRelativeTime(event.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={History} title="No recent activity" message="Donation activity will appear here once you start listing surplus stock." />
          )}
        </Card>
      </div>

      <Card className="mt-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] scroll-mt-4" id="donation-history">
        <CardHeader eyebrow="History" title="Donation history" />
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative sm:w-64">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <Input
              value={historySearch}
              onChange={(event) => { setHistorySearch(event.target.value); setPage(1); }}
              placeholder="Search product or organization"
              className="pl-8"
            />
          </div>
          <div className="w-full sm:w-40">
            <Select value={historyStatus} onChange={(event) => { setHistoryStatus(event.target.value); setPage(1); }}>
              {HISTORY_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </div>
        </div>
        <Table
          columns={[
            { key: 'id', label: 'Donation ID', render: (row) => <span className="font-mono text-[12px] text-[var(--muted)]">#{row.id.slice(-6).toUpperCase()}</span> },
            { key: 'productName', label: 'Product' },
            { key: 'quantity', label: 'Quantity', render: (row) => `${formatQuantity(row.quantity)} ${row.unit}` },
            { key: 'requestedByName', label: 'Organization', render: (row) => row.requestedByName || '—' },
            { key: 'status', label: 'Status', render: (row) => <Badge tone={donationTone(row.status)}>{donationStatusLabel(row.status)}</Badge> },
            {
              key: 'pickupDate',
              label: 'Pickup date',
              render: (row) => (
                <span className="flex flex-col gap-1">
                  <span>{row.pickupDate ? formatDate(row.pickupDate) : '—'}</span>
                  {row.status === 'completed' && (row.confirmedAt || row.updatedAt) ? (
                    <time
                      className="text-[12px] text-[var(--muted)]"
                      dateTime={row.confirmedAt || row.updatedAt}
                    >
                      Completed {formatDateTimeManila(row.confirmedAt || row.updatedAt)}
                    </time>
                  ) : null}
                </span>
              ),
            },
          ]}
          rows={pageRows}
          emptyMessage={history.length ? 'No donations match your search.' : 'No donation history yet — completed and cancelled donations will be listed here.'}
        />
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </Card>

      <Modal
        open={Boolean(donationProduct)}
        onClose={closeDonationComposer}
        eyebrow="Donate remaining stock"
        title="Create or add to donation offer"
        dialogLabel="Create or add stock to a donation offer for partner organizations"
        className="farmer-donation-create-overlay"
      >
        {donationProduct ? (
          <form className="flex flex-col gap-5" onSubmit={createDonationOffer}>
            <div className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--soft)] px-4 py-3">
              <img
                className="farmer-donation-marker"
                src={donateMapPin}
                alt=""
                aria-hidden="true"
              />
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted)]">Your donation offer</p>
                <p className="mt-1 text-[15px] font-semibold text-[var(--text)]">{donationProduct.name}</p>
                <p className="mt-1 text-[13px] text-[var(--muted)]">
                  {formatQuantity(donationProduct.quantity)} {donationProduct.unit} will be offered to verified partner organizations.
                </p>
              </div>
            </div>
            <div className="farmer-donation-expiration-grid">
              <label className="farmer-donation-pickup-field">
                <span>Offer expiration date</span>
                <input
                  type="date"
                  min={minPickupDate}
                  value={donationDraft.expirationDate}
                  onChange={(event) => setDonationDraft((previous) => ({ ...previous, expirationDate: event.target.value }))}
                  required
                />
                <small>Helps partner organizations prioritize pickup before it spoils.</small>
              </label>
              <label className="farmer-donation-pickup-field">
                <span>Offer expiration time</span>
                <input
                  type="time"
                  value={donationDraft.expirationTime}
                  onChange={(event) => setDonationDraft((previous) => ({ ...previous, expirationTime: event.target.value }))}
                  required
                />
                <small>Uses Philippines time (Asia/Manila).</small>
              </label>
            </div>
            <p className="text-[13px] leading-5 text-[var(--muted)]">
              Matching available offers from your account with the same product, unit, and exact expiration time receive this stock instead of creating a duplicate. Offers with pending or scheduled claims stay separate. Donated stock is removed from your marketplace listing.
            </p>
            <div className="flex justify-end gap-2 border-t border-[var(--line)] pt-4">
              <Button type="button" variant="secondary" onClick={closeDonationComposer} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving || !donationDraft.expirationDate || !donationDraft.expirationTime}>
                {saving ? 'Adding donated stock...' : 'Create or add donated stock'}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(selectedRequest)}
        onClose={() => { if (!saving) setSelectedRequest(null); }}
        eyebrow={requestStage === 'details' ? 'Pending request' : 'Review decision'}
        title={requestStage === 'details' ? 'Donation request' : requestStage === 'accept' ? 'Accept donation request?' : 'Decline donation request?'}
        dialogLabel={requestStage === 'details' ? 'Donation request details' : requestStage === 'accept' ? 'Confirm donation request acceptance' : 'Confirm donation request decline'}
        className="farmer-donation-review-overlay"
      >
        {selectedRequest ? (
          <div className="farmer-donation-review">
            {error ? <p className="farmer-donation-review-error" role="alert">{error}</p> : null}
            {requestStage === 'details' ? (
              <>
                <div className="farmer-donation-review-partner">
                  <p>{selectedRequest.requestedByName || 'Partner organization'}</p>
                  <span>Partner organization</span>
                </div>

                <section className="farmer-donation-review-section" aria-labelledby="request-details-heading">
                  <h3 id="request-details-heading">Request details</h3>
                  <dl>
                    <div><dt>Product</dt><dd>{selectedRequest.productName}</dd></div>
                    <div><dt>Quantity requested</dt><dd>{formatQuantity(selectedRequest.quantity)} {selectedRequest.unit}</dd></div>
                    <div><dt>Available donation</dt><dd>{formatQuantity(selectedRequest.availableQuantity ?? selectedRequest.quantity)} {selectedRequest.unit}</dd></div>
                    <div><dt>Requested on</dt><dd>{formatDate(selectedRequest.updatedAt)}</dd></div>
                  </dl>
                </section>

                <section className="farmer-donation-review-section" aria-labelledby="request-pickup-heading">
                  <h3 id="request-pickup-heading">Pickup</h3>
                  <dl>
                    <div><dt>Pickup location</dt><dd>{selectedRequest.location || 'Not provided'}</dd></div>
                    {selectedRequest.pickupDate ? <div><dt>Pickup date</dt><dd>{formatDate(selectedRequest.pickupDate)}</dd></div> : null}
                  </dl>
                </section>

                <div className="farmer-donation-review-actions is-review">
                  <Button variant="danger" disabled={saving} onClick={() => setRequestStage('decline')}>Decline</Button>
                  <Button disabled={saving} onClick={() => setRequestStage('accept')}>Accept request</Button>
                </div>
              </>
            ) : requestStage === 'accept' ? (
              <>
                <div className="farmer-donation-confirm-summary">
                  <strong>{selectedRequest.productName}</strong>
                  <span>{formatQuantity(selectedRequest.quantity)} {selectedRequest.unit}</span>
                  <span>{selectedRequest.requestedByName || 'Partner organization'}</span>
                </div>
                <label className="farmer-donation-pickup-field">
                  <span>Pickup date</span>
                  <input
                    type="date"
                    min={minPickupDate}
                    max={selectedRequest.expirationDate || undefined}
                    value={requestPickupDate}
                    onChange={(event) => setPickupDrafts((previous) => ({ ...previous, [selectedRequest.claimId || selectedRequest.id]: event.target.value }))}
                    required
                  />
                  {selectedRequest.expirationDate ? <small>Choose a date on or before {formatDate(selectedRequest.expirationDate)}.</small> : null}
                </label>
                <div className="farmer-donation-review-actions">
                  <Button variant="secondary" disabled={saving} onClick={() => setRequestStage('details')}>Cancel</Button>
                  <Button disabled={saving || !requestPickupDate} onClick={acceptRequest}>
                    {saving ? 'Confirming…' : 'Confirm acceptance'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="farmer-donation-confirm-summary">
                  <strong>{selectedRequest.productName}</strong>
                  <span>{formatQuantity(selectedRequest.quantity)} {selectedRequest.unit}</span>
                  <span>{selectedRequest.requestedByName || 'Partner organization'}</span>
                </div>
                <p className="farmer-donation-decline-copy">This request will be declined and the donation will return to available offers.</p>
                <div className="farmer-donation-review-actions">
                  <Button variant="secondary" disabled={saving} onClick={() => setRequestStage('details')}>Cancel</Button>
                  <Button variant="danger" disabled={saving} onClick={declineRequest}>
                    {saving ? 'Declining…' : 'Confirm decline'}
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </Modal>

      {trackingTarget ? (
        <DonationPickupTrackingModal
          donation={trackingTarget}
          claim={trackingTarget.claimObj || null}
          viewerRole="farmer"
          onConfirmHandover={async (donId, clmId) => {
            const updated = await confirmDonationHandover(donId, clmId);
            setNotice('Donation Confirmed. Handover recorded.');
            await reload();
            return updated;
          }}
          onClose={() => setTrackingTarget(null)}
          onStatusUpdated={() => reload()}
        />
      ) : null}

      <DonationHandoverConfirmModal
        open={Boolean(confirmHandoverTarget)}
        busy={saving}
        error={error}
        onCancel={() => { if (!saving) setConfirmHandoverTarget(null); }}
        onConfirm={async () => {
          if (!confirmHandoverTarget) return;
          const ok = await run(
            () => confirmDonationHandover(confirmHandoverTarget.id, confirmHandoverTarget.claimId || null),
            'Donation Confirmed. Handover recorded.',
          );
          if (ok) setConfirmHandoverTarget(null);
        }}
      />
    </AppShell>
  );
}
