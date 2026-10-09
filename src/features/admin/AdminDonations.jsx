import { useEffect, useState } from 'react';
import { ArrowRight, Search, RotateCw } from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import Table from '../../components/admin/Table';
import Badge from '../../components/admin/Badge';
import Pagination from '../../components/admin/Pagination';
import Modal from '../../components/admin/Modal';
import { donationTone } from '../../components/admin/statusTone';
import { useAuth } from '../auth/AuthContext';
import { getAdminDonationPage } from '../../services/donationService';
import { formatDate, formatTime } from '../../utils/formatters';
import { adminNavItems } from './adminNav';
import './AdminDonations.css';

const STATUSES = [
  ['available', 'Available'], ['requested', 'Reserved / Claimed'],
  ['scheduled', 'Pickup scheduled'], ['completed', 'Completed'], ['cancelled', 'Cancelled'],
];
const statusLabel = (status) => STATUSES.find(([key]) => key === status)?.[1] || status;
const dateLabel = (value) => value ? formatDate(value.length === 10 ? `${value}T12:00:00+08:00` : value) : 'Not recorded';
const todayInCebu = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

function donationUrgency(row, today = todayInCebu()) {
  if (['completed', 'cancelled'].includes(row.status)) return null;
  if (row.status === 'scheduled' && row.pickupDate && row.pickupDate < today) return { label: 'Pickup overdue', tone: 'danger' };
  if (row.expirationDate) {
    const expiration = row.expirationDate.slice(0, 10);
    if (expiration < today) return { label: 'Expired', tone: 'danger' };
    if ((Date.parse(expiration) - Date.parse(today)) / 86400000 <= 2) return { label: 'Expires soon', tone: 'warning' };
  }
  return null;
}

function DonationDetails({ donation: row, onClose }) {
  return <Modal open={Boolean(row)} onClose={onClose} title="Donation details">
    {row ? <div className="admin-donation-details">
      {row.image ? <img src={row.image} alt={row.productName} className="admin-donation-image" /> : null}
      <h3>{row.productName}</h3>
      <dl>
        {[
          ['Quantity', `${row.quantity} ${row.unit}`], ['Farmer', row.farmerName],
          ['Receiving organization', row.requestedByName || 'Not claimed'],
          ['Status', statusLabel(row.status)], ['Created', dateLabel(row.createdAt)],
          ['Pickup schedule', row.pickupDate ? dateLabel(row.pickupDate) : 'Not scheduled'],
          ['Pickup location', row.location || 'Not recorded'],
          ['Expiration', row.expirationDate ? dateLabel(row.expirationDate) : 'Not recorded'],
          ['Completion date', 'Not recorded separately'],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}
      </dl>
      <section className="admin-donation-history">
        <h3>Status record</h3>
        <ol>
          <li><strong>Donation created</strong><span>{dateLabel(row.createdAt)}{row.createdAt ? `, ${formatTime(row.createdAt)}` : ''}</span></li>
          {row.requestedByName ? <li><strong>Receiving organization</strong><span>{row.requestedByName}</span></li> : null}
          {row.pickupDate ? <li><strong>Pickup scheduled for</strong><span>{dateLabel(row.pickupDate)}</span></li> : null}
          {row.updatedAt && row.updatedAt !== row.createdAt ? <li><strong>Record last updated</strong><span>{dateLabel(row.updatedAt)}, {formatTime(row.updatedAt)}</span></li> : null}
        </ol>
        <p>Individual status-change timestamps are not recorded in the existing donation record.</p>
      </section>
    </div> : null}
  </Modal>;
}

export default function AdminDonations() {
  const { currentUser } = useAuth();
  const [filters, setFilters] = useState({ search: '', status: '', from: '', to: '', page: 1 });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setLoadError('');
      getAdminDonationPage(filters).then((data) => {
        if (cancelled) return;
        const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
        if (filters.page > lastPage) setFilters((values) => ({ ...values, page: lastPage }));
        else setResult(data);
      }).catch((error) => {
        if (!cancelled) setLoadError(error.message || 'Unable to load donations. Please try again.');
      }).finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [filters, refresh]);

  const changeFilter = (key, value) => {
    setLoading(true);
    setFilters((values) => ({ ...values, [key]: value, page: 1 }));
  };
  const emptyMessage = filters.search || filters.from || filters.to ? 'No donations match your filters'
    : filters.status === 'completed' ? 'No completed donations yet'
      : filters.status === 'available' ? 'No available donations' : filters.status ? `No ${statusLabel(filters.status).toLowerCase()} donations` : 'No donations yet';

  return <AppShell user={currentUser} navItems={adminNavItems} title="Donations" hideHeader>
    <div className="admin-donations-page">
      <PageHeader title="Donations" description="Surplus donation lifecycle across every farmer and partner organization." />
      <dl className="admin-donation-overview" aria-label="Donation totals across all records">
        {STATUSES.map(([status, label]) => <div key={status}><dt>{label}</dt><dd>{result?.counts?.[status] ?? '--'}</dd></div>)}
      </dl>
      <section className="admin-donation-register" aria-label="Donation register">
        <div className="admin-donation-toolbar">
          <label className="admin-donation-search"><span>Search donations</span><div><Search size={16} aria-hidden="true" /><input type="search" maxLength={120} placeholder="Product, farmer or organization" value={filters.search} onChange={(event) => changeFilter('search', event.target.value)} /></div></label>
          <label><span>Status</span><select value={filters.status} onChange={(event) => changeFilter('status', event.target.value)}><option value="">All statuses</option>{STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Created from</span><input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => changeFilter('from', event.target.value)} /></label>
          <label><span>Created to</span><input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => changeFilter('to', event.target.value)} /></label>
          <button type="button" className="admin-donation-refresh" title="Refresh donations" aria-label="Refresh donations" disabled={loading} onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}><RotateCw size={16} /></button>
        </div>
        {loadError ? <div className="form-alert error" role="alert">{loadError} <button type="button" onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}>Try again</button></div> : null}
        {loading ? <p className="admin-donation-loading" role="status">Loading donations...</p> : null}
        <div className="admin-donation-table" aria-busy={loading}>
          {result && !loading && !loadError ? <Table
            columns={[
              { key: 'productName', label: 'Product', render: (row) => <div><strong>{row.productName}</strong>{row.expirationDate ? <small>Expires {dateLabel(row.expirationDate)}</small> : null}</div> },
              { key: 'farmerName', label: 'Farmer' },
              { key: 'quantity', label: 'Qty', render: (row) => `${row.quantity} ${row.unit}` },
              { key: 'requestedByName', label: 'Organization', render: (row) => row.requestedByName || <span className="admin-donation-secondary">Not claimed</span> },
              { key: 'pickupDate', label: 'Pickup', render: (row) => row.pickupDate ? dateLabel(row.pickupDate) : <span className="admin-donation-secondary">Not scheduled</span> },
              { key: 'createdAt', label: 'Created', render: (row) => dateLabel(row.createdAt) },
              { key: 'status', label: 'Status', render: (row) => { const urgency = donationUrgency(row); return <div><Badge tone={donationTone(row.status)}>{statusLabel(row.status)}</Badge>{urgency ? <small className={`admin-donation-urgency ${urgency.tone}`}>{urgency.label}</small> : row.status === 'available' ? <small>Waiting for recipient</small> : null}</div>; } },
              { key: 'action', label: 'Action', render: (row) => <button type="button" className="admin-donation-action" onClick={() => setSelected(row)} aria-label={`View details for ${row.productName}`}>View details <ArrowRight size={14} aria-hidden="true" /></button> },
            ]}
            rows={result.donations}
            emptyMessage={emptyMessage}
          /> : null}
        </div>
        <div className="admin-donation-footer"><span>20 donations per page</span>{result && !loading && !loadError ? <Pagination page={filters.page} pageSize={20} total={result.total} onPageChange={(page) => { setLoading(true); setFilters((values) => ({ ...values, page })); }} /> : null}</div>
      </section>
      <DonationDetails donation={selected} onClose={() => setSelected(null)} />
    </div>
  </AppShell>;
}
