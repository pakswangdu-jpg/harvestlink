import { useEffect, useState } from 'react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import Button from '../../../components/admin/Button';
import Table from '../../../components/admin/Table';
import LoadingState from '../../../components/admin/LoadingState';
import { getOverrideHistory } from '../../../services/marketPriceService';
import { formatCurrency, formatDate } from '../../../utils/formatters';
import { listingComparison, priceDifference } from './pricePresentation';

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-[12px] shadow-sm">
      <p className="font-medium text-[var(--text)]">{label}</p>
      <p className="text-[var(--muted)]">
        {formatCurrency(point.price)}/kg {point.isOverride ? '(admin override)' : '(PSA)'}
      </p>
    </div>
  );
}

function HistoryChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-[12px] shadow-sm">
      <p className="font-medium text-[var(--text)]">{label}</p>
      <p className="text-[var(--muted)]">
        {point.price == null ? 'Reference deactivated' : `${formatCurrency(point.price)}/${point.unit} · Admin reference`}
      </p>
    </div>
  );
}





function PriceHistoryChart({ history, unit }) {
  if (!history.length) return null;
  const points = [...history].reverse().map((entry) => ({
    date: formatDate(entry.effectiveDate || entry.createdAt),
    price: entry.newPrice,
    unit: entry.newUnit || entry.previousUnit || unit,
  }));
  return (
    <div style={{ height: 140 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={{ stroke: 'var(--line)' }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(value) => formatCurrency(value)}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<HistoryChartTooltip />} cursor={{ stroke: 'var(--line)' }} />
          <Line
            type="stepAfter"
            dataKey="price"
            stroke="var(--blue-700)"
            strokeWidth={1.75}
            dot={{ r: 3, fill: 'var(--blue-700)', strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PriceTrendChart({ points }) {
  const plotted = points.filter((point) => point.price != null);
  if (plotted.length < 2) {
    return <p className="py-6 text-center text-[13px] text-[var(--muted)]">Not enough PSA history yet to chart a trend.</p>;
  }
  return (
    <div style={{ height: 160 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={{ stroke: 'var(--line)' }} tickLine={false} />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(value) => formatCurrency(value)}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--line)' }} />
          <Line
            type="monotone"
            dataKey="price"
            stroke="var(--green-800)"
            strokeWidth={1.75}
            dot={{ r: 2.5, fill: 'var(--green-800)', strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            connectNulls
            isAnimationActive
            animationDuration={300}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}




export default function CommodityDetailPanel({ row, onOpenOverride, onResetOverride }) {
  const [history, setHistory] = useState(null);
  const [historyMarketType, setHistoryMarketType] = useState('');
  const [historyError, setHistoryError] = useState('');
  const psaTrendPoints = row.trendPoints.filter((point) => point.price != null && !point.isOverride);
  const hasPsaTrend = psaTrendPoints.length >= 2;

  useEffect(() => {
    let cancelled = false;
    getOverrideHistory(row.id, historyMarketType)
      .then((data) => { if (!cancelled) { setHistory(data); setHistoryError(''); } })
      .catch((error) => { if (!cancelled) setHistoryError(error.message || 'Could not load override history.'); });
    return () => { cancelled = true; };
  }, [row.id, historyMarketType, row.retailOverride?.updatedAt, row.wholesaleOverride?.updatedAt]);

  const formatMarketTypeLabel = (value) => (
    value === 'wholesale' ? 'Wholesale' : value === 'retail' ? 'Retail' : 'Unspecified (legacy)'
  );

  return (
    <div className="pm-details">
      <dl className="pm-detail-prices">
        {[
          ['PSA reference', row.loading ? 'Loading...' : row.psaPrice == null ? 'No PSA data' : `${formatCurrency(row.psaPrice)}/kg (PSA ${row.psaYear})`],
          ['Retail admin reference', row.isRetailOverride ? `${formatCurrency(row.retailOverride?.referencePrice ?? row.retailReferencePrice)}/${row.retailOverride?.unit || row.unit} · ${row.retailOverride?.source === 'verified_local_market' ? 'Verified local survey' : 'Admin-entered'}` : 'Not set'],
          ['Wholesale admin reference', row.isWholesaleOverride ? `${formatCurrency(row.wholesaleOverride?.referencePrice ?? row.wholesaleReferencePrice)}/${row.wholesaleOverride?.unit || row.unit} · ${row.wholesaleOverride?.source === 'verified_local_market' ? 'Verified local survey' : 'Admin-entered'}` : 'Not set'],
          ['Effective retail reference', row.referencePrice == null ? 'Unavailable' : `${formatCurrency(row.referencePrice)}/${row.unit} · ${row.isRetailOverride ? 'Admin source' : `PSA ${row.referenceYear || ''}`}`],
          ['Average Farmer price', row.avgFarmerPrice == null ? '-' : `${formatCurrency(row.avgFarmerPrice)}/kg`],
          ['Lowest Farmer price', row.lowFarmerPrice == null ? '-' : `${formatCurrency(row.lowFarmerPrice)}/kg`],
          ['Highest Farmer price', row.highFarmerPrice == null ? '-' : `${formatCurrency(row.highFarmerPrice)}/kg`],
          ['Active listings', row.listingsCount],
          ['Difference vs retail reference', row.loading || row.unit !== 'kg' ? '-' : priceDifference(row.avgFarmerPrice, row.referencePrice)?.label || '-'],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <div className="pm-detail-actions">
        <Button variant="secondary" disabled={row.loading} onClick={() => onOpenOverride(row, 'retail')}>
          {row.isRetailOverride ? 'Edit retail reference' : 'Set retail reference'}
        </Button>
        {row.isRetailOverride && (
          <Button variant="secondary" disabled={row.loading} onClick={() => onResetOverride(row, 'retail')}>
            Deactivate retail price
          </Button>
        )}
        <Button variant="secondary" disabled={row.loading} onClick={() => onOpenOverride(row, 'wholesale')}>
          {row.isWholesaleOverride ? 'Edit wholesale reference' : 'Set wholesale reference'}
        </Button>
        {row.isWholesaleOverride && (
          <Button variant="secondary" disabled={row.loading} onClick={() => onResetOverride(row, 'wholesale')}>
            Deactivate wholesale price
          </Button>
        )}
        <a href={`#override-history-${row.id}`} className="pm-link">View history</a>
      </div>
      <h3>Related Farmer listings</h3>
      <Table columns={[
        { key: 'name', label: 'Product' }, { key: 'farmerName', label: 'Farmer' },
        { key: 'grade', label: 'Grade', render: (product) => product.grade || '-' },
        { key: 'sellingType', label: 'Sales type', render: (product) => product.sellingType === 'wholesale' ? <>Wholesale<small>Min. {product.moq || 0} {product.unit}</small></> : 'Retail' },
        { key: 'price', label: 'Price', render: (product) => <>{formatCurrency(product.price)}/{product.unit}<small>{listingComparison(product, row)?.label || 'No comparable reference'}</small></> },
        { key: 'quantity', label: 'Stock', render: (product) => `${product.quantity} ${product.unit}` },
        { key: 'status', label: 'Status' },
      ]} rows={row.relatedListings || []} emptyMessage="No related Farmer listings." />

      <div className="pm-history-section">
        <h3>{hasPsaTrend ? 'Reference trend (last 5 years)' : 'Admin reference price history'}</h3>
        {!hasPsaTrend ? (
          history === null ? <LoadingState rows={1} />
            : history.length ? <PriceHistoryChart history={history} unit={row.unit} />
              : row.isCustom
                ? <p className="py-6 text-center text-[13px] text-[var(--muted)]">No Admin reference prices to chart yet.</p>
                : <PriceTrendChart points={row.trendPoints} />
        ) : <PriceTrendChart points={row.trendPoints} />}
      </div>

      <div className="pm-history-section" id={`override-history-${row.id}`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3>Reference price history</h3>
          <select
            aria-label="Filter history by market type"
            className="pm-reason-choice"
            style={{ width: 'auto', minWidth: 160 }}
            value={historyMarketType}
            onChange={(event) => {
              setHistory(null);
              setHistoryMarketType(event.target.value);
            }}
          >
            <option value="">All market types</option>
            <option value="retail">Retail</option>
            <option value="wholesale">Wholesale</option>
          </select>
        </div>
        {historyError ? <p role="alert">{historyError}</p> : history === null ? (
          <LoadingState rows={2} />
        ) : !history.length ? (
          <p className="pm-empty">No reference price changes recorded for this selection yet.</p>
        ) : (
          <>
            <PriceHistoryChart history={history} unit={row.unit} />
            <Table
              columns={[
                { key: 'createdAt', label: 'Date / time', render: (entry) => entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '-' },
                { key: 'marketType', label: 'Market type', render: (entry) => formatMarketTypeLabel(entry.marketType) },
                { key: 'previousPrice', label: 'Previous Price', render: (entry) => (entry.previousPrice == null ? '—' : `${formatCurrency(entry.previousPrice)}/${entry.previousUnit || row.unit}`) },
                { key: 'newPrice', label: 'New Price', render: (entry) => (entry.newPrice == null ? 'Deactivated' : `${formatCurrency(entry.newPrice)}/${entry.newUnit || row.unit}`) },
                { key: 'newSource', label: 'Source', render: (entry) => entry.newSource === 'verified_local_market' ? 'Verified local survey' : entry.newSource === 'admin_entered' ? 'Admin-entered' : '—' },
                { key: 'supportingReference', label: 'Supporting reference', render: (entry) => <span className="whitespace-normal">{entry.supportingReference || '—'}</span> },
                { key: 'updatedByName', label: 'Updated By', render: (entry) => entry.updatedByName || '—' },
                { key: 'reason', label: 'Reason', render: (entry) => <span className="whitespace-normal">{entry.reason || '—'}</span> },
              ]}
              rows={history}
              emptyMessage="No reference price changes recorded for this selection yet."
            />
          </>
        )}
      </div>
    </div>
  );
}
