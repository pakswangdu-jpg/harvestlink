import { useEffect, useRef, useState } from 'react';
import { TrendingDown } from 'lucide-react';
import annualAverageIcon from '../../assets/icons/market-annual-average.png';
import trendUpIcon from '../../assets/icons/market-trend-up.png';
import AppShell from '../../components/layout/AppShell';
import StatCard from '../../components/cards/StatCard';
import DataTable from '../../components/dashboard/DataTable';
import PriceTrendChart from '../../components/market/PriceTrendChart';
import { useAuth } from '../auth/AuthContext';
import {
  fetchAnnualPriceTrend,
  getCommodityById,
  MARKET_COMMODITIES,
  MARKET_REGION_LABEL,
  PSA_SOURCE_URL,
} from '../../services/marketPriceService';
import { formatCurrency } from '../../utils/formatters';
import { farmerNavItems } from '../farmer/farmerNav';
import { buyerNavItems } from '../buyer/buyerNav';

export default function MarketInsights() {
  const { currentUser } = useAuth();
  const navItems = currentUser.role === 'farmer' ? farmerNavItems : buyerNavItems;
  const [commodityId, setCommodityId] = useState(MARKET_COMMODITIES[0].id);
  const [result, setResult] = useState({ commodityId: null, points: null, error: '' });
  const commodity = getCommodityById(commodityId);
  const isLoading = result.commodityId !== commodityId;
  const points = isLoading ? null : result.points;
  const error = isLoading ? '' : result.error;

  useEffect(() => {
    let cancelled = false;

    fetchAnnualPriceTrend(commodityId, 6)
      .then((data) => {
        if (!cancelled) setResult({ commodityId, points: data, error: '' });
      })
      .catch(() => {
        if (!cancelled) {
          setResult({ commodityId, points: null, error: 'Unable to reach the PSA market price service. Please try again later.' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [commodityId]);

  // 'nearest' only scrolls the crop list if the selected row genuinely isn't visible — a
  // direct click (the only way commodityId ever changes today) already has its target on
  // screen, so this is a no-op then and the list's own scroll position is left exactly where
  // the user had it, while still covering any future non-click path that selects a crop
  // that's currently scrolled out of view.
  const selectedCropRowRef = useRef(null);
  useEffect(() => {
    selectedCropRowRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [commodityId]);

  const valid = points ? points.filter((point) => point.price != null) : [];
  const latest = valid[valid.length - 1];
  const earliest = valid[0];
  const highest = valid.length ? valid.reduce((a, b) => (b.price > a.price ? b : a)) : null;
  const lowest = valid.length ? valid.reduce((a, b) => (b.price < a.price ? b : a)) : null;
  const overallChange = latest && earliest && latest.year !== earliest.year
    ? ((latest.price - earliest.price) / earliest.price) * 100
    : null;

  return (
    <AppShell
      user={currentUser}
      navItems={navItems}
      title="Market price insights"
      subtitle="Historical farmgate crop prices from the Philippine Statistics Authority, for Central Visayas."
    >
      <section className="panel marketplace-toolbar">
        <div className="form-field market-select">
          <span>Crop</span>
          <div className="crop-select-list" role="listbox" aria-label="Crop">
            {MARKET_COMMODITIES.map((item) => {
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
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <StatCard
          label="Latest annual average"
          value={latest ? formatCurrency(latest.price) : '—'}
          icon={<img src={annualAverageIcon} alt="" width={20} height={20} className="h-5 w-5 object-contain" />}
          iconClassName="stat-icon-transparent"
          hint={latest?.isOverride ? 'Set by admin, overriding PSA' : null}
        />
        <StatCard
          label={earliest ? `Change since ${earliest.year}` : 'Change'}
          value={overallChange != null ? `${overallChange >= 0 ? '+' : ''}${overallChange.toFixed(1)}%` : '—'}
          icon={overallChange != null && overallChange < 0
            ? <TrendingDown size={20} />
            : <img src={trendUpIcon} alt="" width={20} height={20} className="h-5 w-5 object-contain" />}
          iconClassName="stat-icon-transparent"
        />
        <StatCard
          label="Highest year"
          value={highest ? `${formatCurrency(highest.price)} (${highest.year})` : '—'}
          icon={<img src={trendUpIcon} alt="" width={20} height={20} className="h-5 w-5 object-contain" />}
          iconClassName="stat-icon-transparent"
        />
        <StatCard
          label="Lowest year"
          value={lowest ? `${formatCurrency(lowest.price)} (${lowest.year})` : '—'}
          icon={<TrendingDown size={20} />}
          iconClassName="stat-icon-transparent"
        />
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{MARKET_REGION_LABEL}</p>
            <h2>{commodity.label} — Farmgate price trend</h2>
          </div>
        </div>
        {error ? <div className="form-alert error">{error}</div> : null}
        {!error && !points ? <p className="muted">Loading PSA market data…</p> : null}
        {!error && points ? <PriceTrendChart points={points} /> : null}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Data</p>
            <h2>Yearly averages</h2>
          </div>
        </div>
        {points ? (
          <DataTable
            columns={[
              { key: 'year', label: 'Year' },
              { key: 'price', label: 'Farmgate price (per kg)', render: (row) => (row.price != null ? formatCurrency(row.price) : 'No data') },
            ]}
            rows={points.map((point) => ({ id: point.year, ...point }))}
            emptyMessage="No data available."
          />
        ) : null}
      </section>

      <p className="market-source">
        Source: <a href={PSA_SOURCE_URL} target="_blank" rel="noreferrer">Philippine Statistics Authority (PSA) OpenStat</a>
        {' '}— Major Crops: Farmgate Prices by Region, Monthly.
      </p>
    </AppShell>
  );
}
