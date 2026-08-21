import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check, Gift, History, Hourglass, Package, PackageCheck, Search, Truck, X,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import Button from '../../components/common/Button';
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
  cancelDonation,
  declineDonationRequest,
  getDonationsByFarmer,
} from '../../services/donationService';
import { STORAGE_KEYS } from '../../utils/constants';
import {
  donationStatusLabel, formatDate, formatQuantity, formatRelativeTime,
} from '../../utils/formatters';
import { farmerNavItems } from './farmerNav';

const HISTORY_STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Newest-first feed of real status changes — no synthetic/sample data, just each donation's
// current lifecycle state turned into a sentence and sorted by when it last changed.
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
      return { id: donation.id, message: `Listed ${donation.productName} (${formatQuantity(donation.quantity)} ${donation.unit}) as a donation offer`, at: donation.createdAt };
    })
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 6);
}

// A dense list row (thumbnail + name + one line of meta + inline actions), not the full
// storefront-style DonationCard — that component's fixed 190px image block is right for a
// marketplace grid but reads as exactly the oversized, low-density card this redesign is
// meant to get away from once it's sitting in a half-width dashboard panel.
function DonationRow({ donation, meta, badge, actions }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--line)] px-3 py-2.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--green-50)] text-[var(--green-800)]">
        {donation.image ? <img src={donation.image} alt="" className="h-full w-full object-cover" /> : <Package size={18} strokeWidth={1.75} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-[13px] font-medium text-[var(--text)]">
          {donation.productName}
          {badge}
        </p>
        <p className="truncate text-[12px] text-[var(--muted)]">{meta}</p>
      </div>
      {actions ? <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">{actions}</div> : null}
    </div>
  );
}

export default function FarmerDonations() {
  const { currentUser } = useAuth();
  const [donations, setDonations] = useState(() => getDonationsByFarmer(currentUser.id));
  const [pickupDrafts, setPickupDrafts] = useState({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('all');

  const reload = () => setDonations(getDonationsByFarmer(currentUser.id));

  useEffect(() => {
    const handleStorage = (event) => {
      if (!event.key || event.key === STORAGE_KEYS.donations) reload();
    };
    const interval = setInterval(reload, 4000);
    window.addEventListener('storage', handleStorage);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser.id]);

  const run = (action, successMessage) => {
    try {
      action();
      setError('');
      setNotice(successMessage);
      reload();
    } catch (actionError) {
      setNotice('');
      setError(actionError.message);
    }
  };

  const requested = donations.filter((donation) => donation.status === 'requested');
  const scheduled = donations.filter((donation) => donation.status === 'scheduled');
  const available = donations.filter((donation) => donation.status === 'available');
  const history = donations.filter((donation) => ['completed', 'cancelled'].includes(donation.status));

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

  const recentActivity = useMemo(() => buildRecentActivity(donations), [donations]);

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
      headerActions={(
        <div className="flex items-center gap-2">
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
            <div className="grid gap-2.5">
              {requested.map((donation) => (
                <DonationRow
                  key={donation.id}
                  donation={donation}
                  meta={`${formatQuantity(donation.quantity)} ${donation.unit} · Requested by ${donation.requestedByName}`}
                  actions={(
                    <>
                      <input
                        type="date"
                        aria-label="Pickup date"
                        value={pickupDrafts[donation.id] || ''}
                        onChange={(event) => setPickupDrafts((previous) => ({ ...previous, [donation.id]: event.target.value }))}
                        className="h-8 rounded-md border border-[var(--line)] px-2 text-[12px] text-[var(--text)]"
                      />
                      <Button
                        size="sm"
                        onClick={() => run(() => acceptDonationRequest(donation.id, pickupDrafts[donation.id]), 'Pickup scheduled.')}
                      >
                        <Check size={15} /> Accept
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => run(() => declineDonationRequest(donation.id), 'Request declined.')}>
                        <X size={15} /> Decline
                      </Button>
                    </>
                  )}
                />
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
                  key={donation.id}
                  donation={donation}
                  meta={`${formatQuantity(donation.quantity)} ${donation.unit} · ${donation.location}`}
                  actions={(
                    <Button size="sm" variant="ghost" onClick={() => run(() => cancelDonation(donation.id), 'Donation withdrawn.')}>
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
              {scheduled.map((donation) => (
                <DonationRow
                  key={donation.id}
                  donation={donation}
                  meta={`${formatQuantity(donation.quantity)} ${donation.unit} · Pickup ${formatDate(donation.pickupDate)}`}
                  actions={(
                    <Button size="sm" variant="ghost" onClick={() => run(() => cancelDonation(donation.id), 'Donation cancelled.')}>
                      Cancel
                    </Button>
                  )}
                />
              ))}
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
            { key: 'pickupDate', label: 'Pickup date', render: (row) => (row.pickupDate ? formatDate(row.pickupDate) : '—') },
            { key: 'actions', label: 'Actions', render: () => '—' },
          ]}
          rows={pageRows}
          emptyMessage={history.length ? 'No donations match your search.' : 'No donation history yet — completed and cancelled donations will be listed here.'}
        />
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </Card>
    </AppShell>
  );
}
