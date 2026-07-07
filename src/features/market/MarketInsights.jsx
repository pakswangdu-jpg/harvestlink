import { useEffect, useState } from 'react';
import { BadgeDollarSign, TrendingDown, TrendingUp } from 'lucide-react';
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
        <label className="form-field market-select">
          <span>Crop</span>
          <select value={commodityId} onChange={(event) => setCommodityId(event.target.value)}>
            {MARKET_COMMODITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </section>

      <section className="stats-grid">
        <StatCard label="Latest annual average" value={latest ? formatCurrency(latest.price) : '—'} icon={<BadgeDollarSign size={20} />} />
        <StatCard
          label={earliest ? `Change since ${earliest.year}` : 'Change'}
          value={overallChange != null ? `${overallChange >= 0 ? '+' : ''}${overallChange.toFixed(1)}%` : '—'}
          icon={overallChange != null && overallChange < 0 ? <TrendingDown size={20} /> : <TrendingUp size={20} />}
        />
        <StatCard label="Highest year" value={highest ? `${formatCurrency(highest.price)} (${highest.year})` : '—'} icon={<TrendingUp size={20} />} />
        <StatCard label="Lowest year" value={lowest ? `${formatCurrency(lowest.price)} (${lowest.year})` : '—'} icon={<TrendingDown size={20} />} />
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
