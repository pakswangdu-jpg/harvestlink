import { useEffect, useMemo, useRef, useState } from 'react';
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
import Modal from '../../components/admin/Modal';
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
import { matchCommodity } from '../../services/marketPriceService';
import { listingComparison } from './priceMonitoring/pricePresentation';
import './AdminPriceMonitoring.css';







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
        <p className="text-[12px] font-medium uppercase text-[var(--muted)]">{label}</p>
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
    rows, products, reviews, loadError, isInitialLoading, pricesProgress, saveOverride, resetOverride, reloadListings,
  } = useCommodityMonitoring();

  const [declined, setDeclined] = useState(null);
  const [reviewNotice, setReviewNotice] = useState('');
  const [reviewError, setReviewError] = useState('');

  const reloadDeclined = () => getDeclinedPriceReviews().then(setDeclined).catch((error) => setReviewError(error.message));
  useEffect(() => { reloadDeclined(); }, []);


  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [yearFilter, setYearFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortState, setSortState] = useState('newest');
  const [pageSize, setPageSize] = useState(10);


  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [modalCommodity, setModalCommodity] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const actionLock = useRef(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkNonce, setBulkNonce] = useState(0);


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
      if (statusFilter !== 'all' && (row.loading || row.status !== statusFilter)) return false;
      return true;
    });
  }, [rows, search, categoryFilter, yearFilter, statusFilter]);

  const sortedRows = useMemo(() => sortCommodities(filteredRows, sortState), [filteredRows, sortState]);
  const {
    page, setPage, pageRows, total,
  } = usePagination(sortedRows, pageSize);

  const noPsaCount = rows.filter((row) => !row.loading && row.status === 'no-psa').length;



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

  const modalInitialPrice = modalCommodity?.referencePrice ?? null;

  const handleConfirmOverride = async (price, reason) => {
    await saveOverride(modalCommodity.id, price, reason, {
      referenceYear: modalCommodity.referenceYear ?? new Date().getFullYear(),
      baselinePrice: modalCommodity.referencePrice ?? null,
    });
  };

  const handleResetOverride = (row) => setConfirmation({ type: 'reset', row });
  const handleConfirmation = async () => {
    if (!confirmation || actionLock.current) return;
    actionLock.current = true;
    setConfirming(true);
    try {
      if (confirmation.type === 'reset') await resetOverride(confirmation.row.id);
      else {
        await reactivatePriceReview(confirmation.row.id);
        reloadListings();
        reloadDeclined();
      }
      setReviewNotice(confirmation.type === 'reset' ? `${confirmation.row.label}'s override was reset.` : `${confirmation.row.name}'s listing was reactivated.`);
      setReviewError('');
      setConfirmation(null);
    } catch (error) { setReviewError(error.message); }
    finally { actionLock.current = false; setConfirming(false); }
  };

  const selectedRows = rows.filter((row) => selectedIds.has(row.id));

  const handleConfirmBulk = async (row, price, reason) => {
    await saveOverride(row.id, price, reason, { referenceYear: row.referenceYear, baselinePrice: row.referencePrice });
  };

  return (
    <AppShell user={currentUser} navItems={adminNavItems} title="Price Monitoring" hideHeader pageClassName="admin-price-monitoring">
      <PageHeader title="Price Monitoring" description="Monitor PSA reference prices, farmer-listed commodity prices, and DTI overrides." />

      <div className="pm-summary mb-4 grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      {reviewNotice ? <Alert tone="success">{reviewNotice}</Alert> : null}
      {reviewError ? <Alert tone="danger">{reviewError}</Alert> : null}
      {loadError ? <Alert tone="danger">{loadError} <button className="pm-link" type="button" onClick={reloadListings}>Retry</button></Alert> : null}

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
                  {alert.key === 'no-psa' && <button type="button" className="pm-link" onClick={() => { setStatusFilter('no-psa'); setPage(1); }}>View missing data</button>}
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

      {


                                                                                }
      <Card className="pm-workspace mb-4">
        <CardHeader title="Commodity price monitoring" />

        {

                                                                                                 }
        <div className="pm-toolbar">
          <div className="relative min-w-0 flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <Input aria-label="Search commodities" placeholder="Search commodities..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" />
          </div>
          <div className="pm-filter-fields">
            <div className="w-[170px]">
              <label>Category</label><Select aria-label="Category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="all">All categories</option>
                {COMMODITY_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </Select>
            </div>
            <div className="w-[120px]">
              <label>Reference year</label><Select aria-label="Reference year" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
                <option value="all">All years</option>
                {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
              </Select>
            </div>
            <div className="w-[170px]">
              <label>Status</label><Select aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {STATUS_FILTER_OPTIONS.filter((value) => value !== 'all').map((value) => (
                  <option key={value} value={value}>{STATUS_META[value].label}</option>
                ))}
              </Select>
            </div>
            <div className="w-[150px]">
              <label>Sort</label><Select aria-label="Sort" value={sortState} onChange={(event) => setSortState(event.target.value)}>
                {SORT_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
              </Select>
            </div>
          </div>
        </div>

        {selectedIds.size > 0 ? (
          <div className="mb-3 flex items-center justify-between rounded-md border border-[var(--line)] bg-[var(--soft)] px-3 py-2">
            <p className="text-[13px] text-[var(--text)]">{selectedIds.size} selected</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setSelectedIds(new Set())}>Clear</Button>
              <Button variant="primary" disabled={selectedRows.some((row) => row.loading)} onClick={() => { setBulkNonce((n) => n + 1); setBulkOpen(true); }}>Bulk Update</Button>
            </div>
          </div>
        ) : null}

        {isInitialLoading ? (
          <LoadingState rows={8} />
        ) : (
          <>
            {!rows.every((row) => !row.loading) ? (
              <div className="pm-progress" role="status"><span>Loading PSA references: {Math.round(pricesProgress * 100)}%</span><progress value={pricesProgress} max="1" aria-label="PSA reference loading" /></div>
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
              onOpenOverrideModal={handleOpenOverrideModal}
              onResetOverride={handleResetOverride}
            />
            <div className="pm-pagination"><Select aria-label="Commodities per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / page</option>)}</Select><Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} /></div>
          </>
        )}
      </Card>

      <Card className="pm-review-section mb-4">
        <CardHeader title="Pending price reviews" />
        <PendingReviews
          reviews={reviews}
          onNotice={setReviewNotice}
          onError={setReviewError}
          onReload={() => { reloadListings(); reloadDeclined(); }}
        />
      </Card>

      <Card className="pm-review-section mb-4">
        <CardHeader title="Declined listings" />
        {declined === null ? (
          <LoadingState />
        ) : declined.length ? (
          <Table
            columns={[
              { key: 'name', label: 'Product' },
              { key: 'farmerName', label: 'Farmer' },
              { key: 'farmerPrice', label: 'Listed price', render: (row) => `${formatCurrency(row.priceReview.farmerPrice)} / ${row.unit}` },
              { key: 'referencePrice', label: 'PSA reference', render: (row) => `${formatCurrency(row.priceReview.referencePrice)} (${row.priceReview.referenceYear})` },
              { key: 'reason', label: 'Decline reason', render: (row) => row.priceReview.declineReason || 'Not recorded' },
              { key: 'decidedAt', label: 'Declined', render: (row) => formatDate(row.priceReview.decidedAt) },
              {
                key: 'actions',
                label: '',
                render: (row) => (
                  <Button
                    variant="primary"
                    onClick={() => setConfirmation({ type: 'reactivate', row })}
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
          <p className="pm-empty"><Check size={16} /> No declined listings.</p>
        )}
      </Card>

      <MarketplaceListings products={products} commodities={rows} />
      <Modal open={Boolean(confirmation)} onClose={() => { if (!actionLock.current) setConfirmation(null); }} title={confirmation?.type === 'reset' ? 'Reset to PSA?' : 'Reactivate this listing?'} className="pm-modal" dialogLabel="Confirm price monitoring action">
        {confirmation && <div className="space-y-4">
          <p>{confirmation.type === 'reset' ? confirmation.row.psaPrice == null ? `Remove the Admin override for ${confirmation.row.label}? No PSA reference is currently available.` : `Reset ${confirmation.row.label} to the PSA reference price of ${formatCurrency(confirmation.row.psaPrice)}/kg (PSA ${confirmation.row.psaYear})?` : `${confirmation.row.name} - ${confirmation.row.farmerName}`}</p>
          {reviewError && <Alert tone="danger">{reviewError}</Alert>}
          <div className="flex justify-end gap-2"><Button variant="secondary" disabled={confirming} onClick={() => setConfirmation(null)}>Cancel</Button><Button variant="primary" disabled={confirming} onClick={handleConfirmation}>{confirming ? 'Saving...' : confirmation.type === 'reset' ? 'Reset' : 'Reactivate'}</Button></div>
        </div>}
      </Modal>

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




function PendingReviews({ reviews, onNotice, onError, onReload }) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const act = async (product, approve) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await (approve ? approvePriceReview(product.id) : declinePriceReview(product.id));
      onNotice(approve ? `${product.name}'s price was approved.` : `${product.name}'s price was declined - the listing is hidden until the farmer revises it.`);
      onError('');
      onReload();
    } catch (error) { onError(error.message); }
    finally { lock.current = false; setBusy(false); }
  };

  if (reviews === null) return <LoadingState />;
  if (!reviews.length) {
    return <p className="pm-empty"><Check size={16} /> No listings currently need review.</p>;
  }

  return (
    <Table
      columns={[
        { key: 'name', label: 'Product' },
        { key: 'farmerName', label: 'Farmer' },
        { key: 'farmerPrice', label: 'Listed price', render: (row) => `${formatCurrency(row.priceReview.farmerPrice)} / ${row.unit}` },
        { key: 'referencePrice', label: 'Review reference', render: (row) => `${formatCurrency(row.priceReview.referencePrice)} (${row.priceReview.referenceYear})` },
        { key: 'deviationPct', label: 'Deviation', render: (row) => <Badge tone="warning">+{row.priceReview.deviationPct}%</Badge> },
        { key: 'reason', label: 'Reason', render: (row) => <span className="text-[var(--muted)]">{row.priceReview.reason}</span> },
        {
          key: 'actions',
          label: '',
          render: (row) => (
            <div className="flex gap-2">
              <Button variant="primary" disabled={busy} onClick={() => act(row, true)}><Check size={14} /> Approve</Button>
              <Button variant="danger" disabled={busy} onClick={() => act(row, false)}><X size={14} /> Decline</Button>
            </div>
          ),
        },
      ]}
      rows={reviews}
      emptyMessage="No pending price reviews."
    />
  );
}



function MarketplaceListings({ products, commodities }) {
  const { page, setPage, pageRows, total } = usePagination(products || [], 10);
  return (
    <Card>
      <CardHeader title="Marketplace listings" />
      {products === null ? (
        <LoadingState />
      ) : (
        <><Table
          columns={[
            { key: 'name', label: 'Product' },
            { key: 'farmerName', label: 'Farmer' },
            { key: 'grade', label: 'Grade', render: (row) => `Grade ${row.grade || 'A'}` },
            { key: 'sellingType', label: 'Sales type', render: (row) => (row.sellingType === 'wholesale' ? `Wholesale (MOQ ${row.moq || 0} ${row.unit})` : 'Retail') },
            { key: 'price', label: 'Price', render: (row) => `${formatCurrency(row.price)} / ${row.unit}` },
            { key: 'comparison', label: 'Reference comparison', render: (product) => {
              const commodity = commodities.find((row) => row.id === matchCommodity(product.name)?.id);
              const comparison = listingComparison(product, commodity);
              return comparison ? <>{comparison.label}<small>vs {commodity.isOverride ? 'Admin' : 'PSA'} reference / kg</small></> : <span className="pm-secondary">Not comparable</span>;
            } },
            { key: 'quantity', label: 'Available', render: (row) => `${row.quantity} ${row.unit}` },
            { key: 'status', label: 'Status', render: (row) => <Badge tone={productStatusTone(row.status)}>{row.status}</Badge> },
          ]}
          rows={pageRows}
          emptyMessage="No products yet."
        /><Pagination page={page} pageSize={10} total={total} onPageChange={setPage} /></>
      )}
    </Card>
  );
}
