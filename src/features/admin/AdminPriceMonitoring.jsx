import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, Database, Info, Package, RotateCcw, Search, ShieldCheck, X,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import { Card, CardHeader } from '../../components/admin/Card';
import Table from '../../components/admin/Table';
import Badge from '../../components/admin/Badge';
import Button from '../../components/admin/Button';
import Input from '../../components/admin/Input';
import Select from '../../components/admin/Select';
import Alert from '../../components/admin/Alert';
import EmptyState from '../../components/admin/EmptyState';
import LoadingState from '../../components/admin/LoadingState';
import Pagination from '../../components/admin/Pagination';
import { usePagination } from '../../components/admin/usePagination';
import { productStatusTone } from '../../components/admin/statusTone';
import { useAuth } from '../auth/AuthContext';
import {
  approvePriceReview, declinePriceReview, getDeclinedPriceReviews, reactivatePriceReview,
} from '../../services/productService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { adminNavItems } from './adminNav';
import { useCommodityMonitoring } from './priceMonitoring/useCommodityMonitoring';
import { COMMODITY_CATEGORIES } from './priceMonitoring/commodityCategories';
import { STATUS_META } from './priceMonitoring/statusMeta';
import { SORT_PRESETS, sortCommodities } from './priceMonitoring/sortCommodities';
import CommodityTable from './priceMonitoring/CommodityTable';
import OverrideModal from './priceMonitoring/OverrideModal';
import BulkUpdateModal from './priceMonitoring/BulkUpdateModal';

// Same color-mix technique as components/admin/StatCard.jsx (the Reports page's summary
// cards) — one tone token pair per card, background/border both derived from it, so the two
// admin "tinted stat card" systems read as one family instead of two different designs.
// Tone is fixed per card identity (not swapped to red/danger when a count is nonzero) — a
// value like "2 price alerts" is communicated by the number and hint text, not by flipping the
// whole card to an alarming color; see the zero-state hints below for how "0" reads as calm.
const SUMMARY_TONES = {
  green: { base: 'var(--green-100)', accent: 'var(--green-700)' },
  blue: { base: 'var(--blue-100)', accent: 'var(--blue-700)' },
  amber: { base: 'var(--amber-100)', accent: 'var(--amber-700)' },
  violet: { base: 'var(--violet-100)', accent: 'var(--violet-700)' },
};

function SummaryCard({
  icon: Icon, label, value, hint, tone = 'green',
}) {
  const { base, accent } = SUMMARY_TONES[tone] || SUMMARY_TONES.green;
  const cardStyle = {
    background: `color-mix(in srgb, ${base} 40%, var(--panel))`,
    borderColor: `color-mix(in srgb, ${accent} 28%, var(--panel))`,
  };
  return (
    <div className="h-full rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4" style={cardStyle}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
        <Icon size={18} strokeWidth={2} className="shrink-0" style={{ color: accent }} aria-hidden="true" />
      </div>
      <p className="mt-2 text-[24px] font-semibold leading-none text-[var(--text)]">{value}</p>
      {hint ? <p className="mt-1.5 text-[12px] text-[var(--muted)]">{hint}</p> : null}
    </div>
  );
}

function isToday(isoString) {
  if (!isoString) return false;
  const date = new Date(isoString);
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

const STATUS_FILTER_OPTIONS = ['all', ...Object.keys(STATUS_META)];

export default function AdminPriceMonitoring() {
  const { currentUser } = useAuth();
  const {
    rows, products, reviews, isInitialLoading, pricesProgress, saveOverride, resetOverride, reloadListings,
  } = useCommodityMonitoring();

  const [declined, setDeclined] = useState(null);
  const [reviewNotice, setReviewNotice] = useState('');
  const [reviewError, setReviewError] = useState('');

  const reloadDeclined = () => getDeclinedPriceReviews().then(setDeclined);
  useEffect(() => { reloadDeclined(); }, []);

  // Filters / search / sort
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortState, setSortState] = useState('newest');
  const [pageSize, setPageSize] = useState(10);

  // Selection / expansion / drafts
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [modalCommodity, setModalCommodity] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkNonce, setBulkNonce] = useState(0);

  // Dismissible alert banners
  const [dismissedAlerts, setDismissedAlerts] = useState(new Set());

  const availableYears = useMemo(
    () => [...new Set(rows.map((row) => row.referenceYear).filter(Boolean))].sort((a, b) => b - a),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (term && !row.label.toLowerCase().includes(term)) return false;
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false;
      if (yearFilter !== 'all' && String(row.referenceYear) !== yearFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      return true;
    });
  }, [rows, search, categoryFilter, yearFilter, statusFilter]);

  const sortedRows = useMemo(() => sortCommodities(filteredRows, sortState), [filteredRows, sortState]);
  const {
    page, setPage, pageRows, total,
  } = usePagination(sortedRows, pageSize);

  const noPsaCount = rows.filter((row) => row.status === 'no-psa').length;
  // The real count of listings PSA-deviation-flagged for DTI review (see priceReview.js) —
  // more literal to "listings exceed the recommended price" than re-deriving a commodity-
  // level status, and it's data the hook already fetches for the table's own status column.
  const flaggedListingsCount = (reviews || []).length;
  const overriddenTodayCount = rows.filter((row) => row.isOverride && isToday(row.override?.updatedAt)).length;
  const overriddenCount = rows.filter((row) => row.isOverride).length;
  const activeListingsCount = rows.reduce((sum, row) => sum + row.listingsCount, 0);

  const alerts = [
    noPsaCount > 0 && {
      key: 'no-psa', tone: 'warning', icon: AlertTriangle, message: `${noPsaCount} commodit${noPsaCount === 1 ? 'y has' : 'ies have'} no PSA data.`,
    },
    flaggedListingsCount > 0 && {
      key: 'overpriced', tone: 'danger', icon: AlertTriangle, message: `${flaggedListingsCount} listing${flaggedListingsCount === 1 ? '' : 's'} exceed${flaggedListingsCount === 1 ? 's' : ''} the recommended price.`,
    },
    overriddenTodayCount > 0 && {
      key: 'overridden-today', tone: 'info', icon: Info, message: `${overriddenTodayCount} reference price${overriddenTodayCount === 1 ? '' : 's'} ${overriddenTodayCount === 1 ? 'was' : 'were'} overridden today.`,
    },
  ].filter(Boolean).filter((alert) => !dismissedAlerts.has(alert.key));

  const handleToggleSelect = (id) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = (ids, checked) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  };

  const handleSort = (key) => setSortState(key);

  const handleOpenOverrideModal = (row) => setModalCommodity(row);

  const modalInitialPrice = modalCommodity && drafts[modalCommodity.id]
    ? Number(drafts[modalCommodity.id])
    : modalCommodity?.referencePrice ?? null;

  const handleConfirmOverride = async (price, reason) => {
    await saveOverride(modalCommodity.id, price, reason, {
      referenceYear: modalCommodity.referenceYear ?? new Date().getFullYear(),
      baselinePrice: modalCommodity.referencePrice ?? null,
    });
    setDrafts((previous) => ({ ...previous, [modalCommodity.id]: '' }));
  };

  const handleResetOverride = async (row) => {
    await resetOverride(row.id);
  };

  const selectedRows = rows.filter((row) => selectedIds.has(row.id));

  const handleConfirmBulk = async (row, price, reason) => {
    await saveOverride(row.id, price, reason, { referenceYear: row.referenceYear, baselinePrice: row.referencePrice });
  };

  return (
    <AppShell user={currentUser} navItems={adminNavItems} title="Price Monitoring" hideHeader>
      <PageHeader title="Price Monitoring" description="Monitor PSA reference prices, farmer-listed commodity prices, and DTI overrides." />

      <div className="mb-4 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={Database} label="PSA Commodities" value={rows.length} hint="Tracked commodities" tone="green" />
        <SummaryCard icon={Package} label="Farmer Listings" value={activeListingsCount.toLocaleString()} hint="Active listings" tone="blue" />
        <SummaryCard
          icon={AlertTriangle}
          label="Price Alerts"
          value={flaggedListingsCount}
          hint={flaggedListingsCount ? 'Needs attention' : 'All clear'}
          tone="amber"
        />
        <SummaryCard
          icon={ShieldCheck}
          label="Overridden Prices"
          value={overriddenCount}
          hint={overriddenCount ? 'Admin-set reference prices' : 'No prices currently overridden'}
          tone="violet"
        />
      </div>

      {alerts.length ? (
        <div className="mb-4 space-y-2">
          {alerts.map((alert) => {
            const ALERT_TONE_CLASSES = {
              warning: 'bg-[var(--amber-100)] text-[var(--amber-700)]',
              danger: 'bg-[var(--red-100)] text-[var(--red-700)]',
              info: 'bg-[var(--blue-100)] text-[var(--blue-700)]',
            };
            const Icon = alert.icon;
            return (
              <div key={alert.key} className={`flex items-center justify-between rounded-md px-4 py-2.5 text-[13px] ${ALERT_TONE_CLASSES[alert.tone]}`}>
                <div className="flex items-center gap-2">
                  <Icon size={15} className="shrink-0" />
                  <span>{alert.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDismissedAlerts((previous) => new Set(previous).add(alert.key))}
                  aria-label="Dismiss"
                  className="ml-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 text-current opacity-70 hover:opacity-100"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* shadow-[...] is a one-off, scoped to this card only — not added to the shared Card
          component, which every other admin page also renders and deliberately stays flat/
          shadow-free. Same value as the app's own --shadow token (0 1px 2px), just applied
          locally rather than changing that shared definition's blast radius. */}
      <Card className="mb-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
        <CardHeader eyebrow="DTI oversight" title="Commodity price monitoring" />

        {/* Search and the filter cluster are two visually separate groups (gap-4 between them)
            instead of one undifferentiated row of controls (gap-2 within each group) — makes
            "search" read as the primary action and the four selects as secondary refinements. */}
        <div className="mb-3 flex flex-wrap items-center gap-4">
          <div className="relative min-w-[240px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <Input placeholder="Search commodity…" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-[170px]">
              <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">All categories</option>
                {COMMODITY_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </Select>
            </div>
            <div className="w-[120px]">
              <Select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                <option value="all">All years</option>
                {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
              </Select>
            </div>
            <div className="w-[170px]">
              <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {STATUS_FILTER_OPTIONS.filter((value) => value !== 'all').map((value) => (
                  <option key={value} value={value}>{STATUS_META[value].label}</option>
                ))}
              </Select>
            </div>
            <div className="w-[150px]">
              <Select value={sortState} onChange={(event) => setSortState(event.target.value)}>
                {SORT_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
              </Select>
            </div>
            <div className="w-[130px]">
              <Select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
                {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / page</option>)}
              </Select>
            </div>
          </div>
        </div>

        {selectedIds.size > 0 ? (
          <div className="mb-3 flex items-center justify-between rounded-md border border-[var(--line)] bg-[var(--soft)] px-3 py-2">
            <p className="text-[13px] text-[var(--text)]">{selectedIds.size} selected</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setSelectedIds(new Set())}>Clear</Button>
              <Button variant="primary" onClick={() => { setBulkNonce((n) => n + 1); setBulkOpen(true); }}>Bulk Update</Button>
            </div>
          </div>
        ) : null}

        {isInitialLoading ? (
          <LoadingState rows={8} />
        ) : (
          <>
            {!rows.every((row) => !row.loading) ? (
              <p className="mb-2 text-[12px] text-[var(--muted)]">Loading PSA reference prices… {Math.round(pricesProgress * 100)}%</p>
            ) : null}
            <CommodityTable
              rows={pageRows}
              searchTerm={search}
              sortState={sortState}
              onSort={handleSort}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAll={handleToggleSelectAll}
              expandedId={expandedId}
              onToggleExpand={(id) => setExpandedId((current) => (current === id ? null : id))}
              drafts={drafts}
              onDraftChange={(id, value) => setDrafts((previous) => ({ ...previous, [id]: value }))}
              onOpenOverrideModal={handleOpenOverrideModal}
              onResetOverride={handleResetOverride}
            />
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <Card className="mb-4">
        <CardHeader eyebrow="DTI oversight" title="Pending price reviews" />
        {reviewNotice ? <Alert tone="success">{reviewNotice}</Alert> : null}
        {reviewError ? <Alert tone="danger">{reviewError}</Alert> : null}
        <PendingReviews
          reviews={reviews}
          onNotice={setReviewNotice}
          onError={setReviewError}
          onReload={() => { reloadListings(); reloadDeclined(); }}
        />
      </Card>

      <Card className="mb-4">
        <CardHeader eyebrow="DTI oversight" title="Declined listings" />
        {declined === null ? (
          <LoadingState />
        ) : declined.length ? (
          <Table
            columns={[
              { key: 'name', label: 'Product' },
              { key: 'farmerName', label: 'Farmer' },
              { key: 'farmerPrice', label: 'Listed price', render: (row) => `${formatCurrency(row.priceReview.farmerPrice)} / ${row.unit}` },
              { key: 'referencePrice', label: 'PSA reference', render: (row) => `${formatCurrency(row.priceReview.referencePrice)} (${row.priceReview.referenceYear})` },
              { key: 'decidedAt', label: 'Declined', render: (row) => formatDate(row.priceReview.decidedAt) },
              {
                key: 'actions',
                label: '',
                render: (row) => (
                  <Button
                    variant="primary"
                    onClick={async () => {
                      try {
                        await reactivatePriceReview(row.id);
                        setReviewNotice(`${row.name}'s listing was reactivated.`);
                        setReviewError('');
                        reloadListings();
                        reloadDeclined();
                      } catch (error) {
                        setReviewError(error.message);
                        setReviewNotice('');
                      }
                    }}
                  >
                    <RotateCcw size={14} /> Reactivate
                  </Button>
                ),
              },
            ]}
            rows={declined}
            emptyMessage="No declined listings."
          />
        ) : (
          <EmptyState title="No declined listings" message="Listings DTI has declined will appear here, with an option to reactivate them." />
        )}
      </Card>

      <MarketplaceListings products={products} />

      <OverrideModal
        commodity={modalCommodity}
        initialPrice={modalInitialPrice}
        onClose={() => setModalCommodity(null)}
        onConfirm={handleConfirmOverride}
      />
      <BulkUpdateModal
        open={bulkOpen}
        nonce={bulkNonce}
        rows={selectedRows}
        onClose={() => { setBulkOpen(false); setSelectedIds(new Set()); }}
        onConfirm={handleConfirmBulk}
      />
    </AppShell>
  );
}

// Presentational only — reviews come from useCommodityMonitoring (which already fetches them
// for status/alert aggregation), so this doesn't re-fetch the same list a second time. Real
// DTI review-queue logic, unchanged from before this redesign.
function PendingReviews({ reviews, onNotice, onError, onReload }) {
  const handleApprove = async (product) => {
    await approvePriceReview(product.id);
    onNotice(`${product.name}'s price was approved.`);
    onError('');
    onReload();
  };

  const handleDecline = async (product) => {
    await declinePriceReview(product.id);
    onNotice(`${product.name}'s price was declined — the listing is hidden until the farmer revises it.`);
    onError('');
    onReload();
  };

  if (reviews === null) return <LoadingState />;
  if (!reviews.length) {
    return <EmptyState title="No pending price reviews" message="Products priced well above the PSA regional reference will appear here for review." />;
  }

  return (
    <Table
      columns={[
        { key: 'name', label: 'Product' },
        { key: 'farmerName', label: 'Farmer' },
        { key: 'farmerPrice', label: 'Listed price', render: (row) => `${formatCurrency(row.priceReview.farmerPrice)} / ${row.unit}` },
        { key: 'referencePrice', label: 'PSA reference', render: (row) => `${formatCurrency(row.priceReview.referencePrice)} (${row.priceReview.referenceYear})` },
        { key: 'deviationPct', label: 'Deviation', render: (row) => <Badge tone="warning">+{row.priceReview.deviationPct}%</Badge> },
        { key: 'reason', label: 'Reason', render: (row) => <span className="text-[var(--muted)]">{row.priceReview.reason}</span> },
        {
          key: 'actions',
          label: '',
          render: (row) => (
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => handleApprove(row)}><Check size={14} /> Approve</Button>
              <Button variant="danger" onClick={() => handleDecline(row)}><X size={14} /> Decline</Button>
            </div>
          ),
        },
      ]}
      rows={reviews}
      emptyMessage="No pending price reviews."
    />
  );
}

// Presentational only — products come from useCommodityMonitoring, avoiding a second
// full-catalog fetch on top of the one the hook already makes for commodity aggregation.
function MarketplaceListings({ products }) {
  return (
    <Card>
      <CardHeader eyebrow="Products" title="Marketplace listings" />
      {products === null ? (
        <LoadingState />
      ) : (
        <Table
          columns={[
            { key: 'name', label: 'Product' },
            { key: 'farmerName', label: 'Farmer' },
            { key: 'grade', label: 'Grade', render: (row) => `Grade ${row.grade || 'A'}` },
            { key: 'sellingType', label: 'Sales type', render: (row) => (row.sellingType === 'wholesale' ? `Wholesale (MOQ ${row.moq || 0} ${row.unit})` : 'Retail') },
            { key: 'price', label: 'Price', render: (row) => `${formatCurrency(row.price)} / ${row.unit}` },
            { key: 'quantity', label: 'Available', render: (row) => `${row.quantity} ${row.unit}` },
            { key: 'status', label: 'Status', render: (row) => <Badge tone={productStatusTone(row.status)}>{row.status}</Badge> },
          ]}
          rows={products}
          emptyMessage="No products yet."
        />
      )}
    </Card>
  );
}
