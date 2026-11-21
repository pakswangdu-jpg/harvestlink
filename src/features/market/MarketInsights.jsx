import { useEffect, useMemo, useRef, useState } from 'react';
import { TrendingDown } from 'lucide-react';
import annualAverageIcon from '../../assets/icons/market-annual-average.png';
import trendUpIcon from '../../assets/icons/market-trend-up.png';
import AppShell from '../../components/layout/AppShell';
import StatCard from '../../components/cards/StatCard';
import DataTable from '../../components/dashboard/DataTable';
import PriceTrendChart from '../../components/market/PriceTrendChart';
import { useAuth } from '../auth/AuthContext';
import { useCatalog } from '../../contexts/CatalogContext';
import {
  fetchAnnualPriceTrend,
  getOverrideHistory,
  isPriceOverrideEffective,
  MARKET_COMMODITIES,
  MARKET_REGION_LABEL,
  PSA_SOURCE_URL,
} from '../../services/marketPriceService';
import { formatCurrency } from '../../utils/formatters';
import { getNavItemsForRole } from '../../utils/navItemsByRole';
import { useAdminMarketReferences } from '../../hooks/useAdminMarketReferences';
import AdminReferenceNotice from '../../components/market/AdminReferenceNotice';

export default function MarketInsights() {
  const { currentUser } = useAuth();
  const { commodities: catalogCommodities, refresh: refreshCatalog } = useCatalog();
  const navItems = getNavItemsForRole(currentUser.role);
  const [commodityId, setCommodityId] = useState(MARKET_COMMODITIES[0].id);
  const [result, setResult] = useState({ commodityId: null, points: null, error: '' });

  useEffect(() => {
    refreshCatalog().catch(() => {});
  }, [refreshCatalog]);
  const selectableCommodities = useMemo(() => [
    ...MARKET_COMMODITIES,
    ...catalogCommodities.map((item) => ({
      ...item,
      label: item.label || [item.name, item.variety].filter(Boolean).join(' '),
      isCustom: true,
    })),
  ], [catalogCommodities]);
  const commodity = selectableCommodities.find((item) => String(item.id) === String(commodityId))
    || selectableCommodities[0];
  const { references, referenceError } = useAdminMarketReferences();
  const adminReference = references.find((reference) => String(reference.commodityId) === String(commodityId)
    && isPriceOverrideEffective(reference));
  const isLoading = result.commodityId !== commodityId;
  const points = isLoading ? null : result.points;
  const error = isLoading ? '' : result.error;

  useEffect(() => {
    let cancelled = false;

    const fetchTrend = commodity.isCustom
      ? getOverrideHistory(commodityId).then((history) => history.slice().reverse().map((entry) => ({
        id: entry.id,
        year: entry.effectiveDate || String(entry.createdAt || '').slice(0, 10),
        price: entry.newPrice == null ? null : Number(entry.newPrice),
        isOverride: true,
      })))
      : fetchAnnualPriceTrend(commodityId, 6);

    fetchTrend
      .then((data) => {
        if (!cancelled) setResult({ commodityId, points: data, error: '' });
      })
      .catch(() => {
        if (!cancelled) {
          setResult({
            commodityId,
            points: null,
            error: commodity.isCustom
              ? 'Unable to load admin reference history. Please try again later.'
              : 'Unable to reach the PSA market price service. Please try again later.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [commodityId, commodity.isCustom, adminReference?.updatedAt]);






  const selectedCropRowRef = useRef(null);
  useEffect(() => {
    selectedCropRowRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [commodityId]);

  const valid = points ? points.filter((point) => point.price != null) : [];
  const latest = commodity.isCustom
    ? adminReference ? {
      year: adminReference.referenceYear,
      price: Number(adminReference.referencePrice),
      isOverride: true,
    } : null
    : valid[valid.length - 1];
  const earliest = valid[0];
  const highest = valid.length ? valid.reduce((a, b) => (b.price > a.price ? b : a)) : null;
  const lowest = valid.length ? valid.reduce((a, b) => (b.price < a.price ? b : a)) : null;
  const overallChange = latest && earliest && latest.year !== earliest.year
    ? commodity.isCustom ? null : ((latest.price - earliest.price) / earliest.price) * 100
    : null;

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="Market price insights"
      subtitle={commodity.isCustom
        ? `Current admin-set reference and price history for ${commodity.label}${commodity.category ? ` (${commodity.category})` : ''}.`
        : 'Historical farmgate crop prices from the Philippine Statistics Authority, for Central Visayas.'}
    >
      <section className="panel marketplace-toolbar">
        <div className="form-field market-select">
          <span>Crop</span>
          <div className="crop-select-list" role="listbox" aria-label="Crop">
            {selectableCommodities.map((item) => {
              const isSelected = item.id === commodityId;
              return (
                <button
                  key={item.id}
                  ref={isSelected ? selectedCropRowRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`crop-select-option${isSelected ? ' is-selected' : ''}`}
                  onClick={() => setCommodityId(item.id)}
                >
                  {item.isCustom && item.category ? `${item.label} — ${item.category}` : item.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {referenceError ? <p className="muted" role="status">{referenceError}</p> : null}
      {adminReference ? <AdminReferenceNotice reference={adminReference} /> : null}
      <section className="stats-grid">
        <StatCard
          label={commodity.isCustom ? 'Latest admin reference' : latest?.isOverride ? 'Admin reference price' : 'Latest annual average'}
          value={latest ? `${formatCurrency(latest.price)}${commodity.isCustom ? `/${commodity.unit}` : ''}` : '—'}
          icon={<img src={annualAverageIcon} alt="" width={20} height={20} className="h-5 w-5 object-contain" />}
          iconClassName="stat-icon-transparent"
          hint={latest?.isOverride ? 'Set by admin, overriding PSA' : null}
        />
        <StatCard
          label={commodity.isCustom ? 'Reference price change' : earliest ? `Change since ${earliest.year}` : 'Change'}
          value={overallChange != null ? `${overallChange >= 0 ? '+' : ''}${overallChange.toFixed(1)}%` : '—'}
          icon={overallChange != null && overallChange < 0
            ? <TrendingDown size={20} />
            : <img src={trendUpIcon} alt="" width={20} height={20} className="h-5 w-5 object-contain" />}
          iconClassName="stat-icon-transparent"
        />
        <StatCard
          label={commodity.isCustom ? 'Highest reference' : 'Highest year'}
          value={highest ? `${formatCurrency(highest.price)} (${highest.year})` : '—'}
          icon={<img src={trendUpIcon} alt="" width={20} height={20} className="h-5 w-5 object-contain" />}
          iconClassName="stat-icon-transparent"
        />
        <StatCard
          label={commodity.isCustom ? 'Lowest reference' : 'Lowest year'}
          value={lowest ? `${formatCurrency(lowest.price)} (${lowest.year})` : '—'}
          icon={<TrendingDown size={20} />}
          iconClassName="stat-icon-transparent"
        />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{commodity.isCustom ? 'Admin-managed commodity' : MARKET_REGION_LABEL}</p>
            <h2>{commodity.label} — {commodity.isCustom ? 'Admin reference history' : 'Farmgate price trend'}</h2>
          </div>
        </div>
        {error ? <div className="form-alert error">{error}</div> : null}
        {!error && !points ? <p className="muted">{commodity.isCustom ? 'Loading admin reference history…' : 'Loading PSA market data…'}</p> : null}
        {!error && points ? (
          <PriceTrendChart
            points={points}
            emptyTitle={commodity.isCustom ? 'No reference history yet' : undefined}
            emptyMessage={commodity.isCustom ? 'An admin reference price will appear here when it is set.' : undefined}
            chartAriaLabel={commodity.isCustom ? 'Admin reference price history' : undefined}
            pointAriaSuffix={commodity.isCustom ? `per ${commodity.unit}` : undefined}
            tooltipCaption={commodity.isCustom ? 'admin reference' : undefined}
            xAxisLabel={commodity.isCustom ? 'year' : 'year'}
          />
        ) : null}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Data</p>
            <h2>{commodity.isCustom ? 'Reference history' : 'Yearly averages'}</h2>
          </div>
        </div>
        {points ? (
          <DataTable
            columns={[
              { key: 'year', label: commodity.isCustom ? 'Effective date' : 'Year' },
              { key: 'price', label: commodity.isCustom ? `Reference price (per ${commodity.unit})` : 'Farmgate price (per kg)', render: (row) => (row.price != null ? formatCurrency(row.price) : 'No data') },
            ]}
            rows={points.map((point, index) => ({ id: point.id || `${point.year}-${index}`, ...point }))}
            emptyMessage="No data available."
          />
        ) : null}
      </section>

      <p className="market-source">
        {commodity.isCustom ? 'Source: HarvestLink admin-set reference history.' : (
          <>Source: <a href={PSA_SOURCE_URL} target="_blank" rel="noreferrer">Philippine Statistics Authority (PSA) OpenStat</a>
            {' '}— Major Crops: Farmgate Prices by Region, Monthly.</>
        )}
      </p>
    </AppShell>
  );
}
