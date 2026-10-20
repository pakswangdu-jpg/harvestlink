import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import AppShell from '../../components/layout/AppShell';
import PageHeader from '../../components/admin/PageHeader';
import LoadingState from '../../components/admin/LoadingState';
import { useAuth } from '../auth/AuthContext';
import { useCatalog } from '../../contexts/CatalogContext';
import { getDemandForecast, getCropForecastDetail } from '../../services/demandForecastService';
import { getProducts } from '../../services/productService';
import { CEBU_MUNICIPALITIES } from '../../utils/constants';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { adminNavItems } from './adminNav';
import './AdminDemandForecast.css';

const DEFAULT_PERIOD = '7_days';

function minimumCustomDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function displayValue(value) {
  return value == null || value === '' ? 'Data unavailable' : value;
}

function marketTrendValue(entry) {
  if (entry?.forecastPrice == null || entry.expectedChangePercent == null) return 'Data unavailable';
  return displayValue(entry.marketTrend);
}

function weatherImpactValue(value) {
  if (value == null || /unavailable|no weather data/i.test(String(value))) return 'Data unavailable';
  return value;
}

function percentValue(value) {
  if (value == null) return 'Data unavailable';
  return `${value > 0 ? '+' : ''}${value}%`;
}

function chartDateLabel(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(date);
}

function mergeSeries(history, forecast, valueKey, forecastKey) {
  const points = new Map();
  (history || []).forEach((point) => {
    if (!point.date || point[valueKey] == null || !Number.isFinite(Number(point[valueKey]))) return;
    const row = points.get(point.date) || { date: point.date };
    row.history = Number(point[valueKey]);
    points.set(point.date, row);
  });
  (forecast || []).forEach((point) => {
    if (!point.date || point[forecastKey] == null || !Number.isFinite(Number(point[forecastKey]))) return;
    const row = points.get(point.date) || { date: point.date };
    row.forecast = Number(point[forecastKey]);
    points.set(point.date, row);
  });
  return [...points.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function ForecastLineChart({ title, description, data, unit, historyLabel, forecastLabel }) {
  const forecastStart = data.find((point) => point.forecast != null)?.date;
  return (
    <section className="admin-forecast-chart" aria-label={title}>
      <div className="admin-forecast-chart-heading">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span>{unit === 'price' ? 'PHP / listed unit' : 'Order volume'}</span>
      </div>
      {data.length ? (
        <>
          <div className="admin-forecast-chart-legend">
            <span><i className="admin-forecast-history-key" />{historyLabel}</span>
            <span><i className="admin-forecast-projection-key" />{forecastLabel}</span>
          </div>
          <div className="admin-forecast-chart-plot">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 4 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  tickFormatter={chartDateLabel}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--line)' }}
                  minTickGap={28}
                  interval="preserveStartEnd"
                  height={34}
                />
                <YAxis
                  tick={{ fill: 'var(--muted)', fontSize: 11 }}
                  tickFormatter={(value) => unit === 'price' ? `₱${Number(value).toFixed(0)}` : Number(value).toFixed(1).replace(/\.0$/, '')}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                />
                <Tooltip
                  formatter={(value) => [unit === 'price' ? formatCurrency(value) : value, undefined]}
                  labelFormatter={(value) => formatDate(`${value}T00:00:00`)}
                  contentStyle={{ background: 'var(--panel)', borderColor: 'var(--line)', borderRadius: 6 }}
                />
                {forecastStart ? <ReferenceLine x={forecastStart} stroke="var(--muted)" strokeDasharray="3 3" /> : null}
                <Line type="monotone" dataKey="history" name={historyLabel} stroke="var(--blue-700)" strokeWidth={2} dot={{ r: 2, fill: 'var(--blue-700)' }} activeDot={{ r: 4 }} connectNulls={false} />
                <Line type="monotone" dataKey="forecast" name={forecastLabel} stroke="var(--green-700)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : <p className="admin-forecast-unavailable">Data unavailable</p>}
    </section>
  );
}

function priceReviewLabel(status) {
  return ({
    pending: 'Pending review',
    approved: 'Approved',
    needs_adjustment: 'Needs price adjustment',
    declined: 'Declined',
  })[status] || 'No price review';
}

export default function AdminDemandForecast() {
  const { currentUser } = useAuth();
  const { categoryNames } = useCatalog();
  const [category, setCategory] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const [customDate, setCustomDate] = useState('');
  const [listState, setListState] = useState({ key: '', data: null, error: '' });
  const [productsState, setProductsState] = useState({ products: [], loading: true, error: '' });
  const [selectedCrop, setSelectedCrop] = useState('');
  const [detailState, setDetailState] = useState({ data: null, loading: false, error: '' });

  const awaitingCustomDate = period === 'custom' && !customDate;
  const listKey = `${category}|${municipality}|${period}|${customDate}`;
  useEffect(() => {
    if (awaitingCustomDate) return undefined;
    let cancelled = false;
    getDemandForecast({ category, municipality, period, customDate })
      .then((data) => {
        if (!cancelled) setListState({ key: listKey, data, error: '' });
      })
      .catch((error) => {
        if (!cancelled) setListState({ key: listKey, data: null, error: error.message });
      });
    return () => { cancelled = true; };
  }, [category, municipality, period, customDate, listKey, awaitingCustomDate]);

  useEffect(() => {
    let cancelled = false;
    getProducts()
      .then((products) => { if (!cancelled) setProductsState({ products, loading: false, error: '' }); })
      .catch((error) => { if (!cancelled) setProductsState({ products: [], loading: false, error: error.message }); });
    return () => { cancelled = true; };
  }, []);

  const listIsCurrent = listState.key === listKey;
  const listData = listIsCurrent ? listState.data : null;
  const listLoading = !awaitingCustomDate && !listIsCurrent;
  const listError = listIsCurrent ? listState.error : '';
  const crops = useMemo(() => listData?.crops || [], [listData]);
  const activeCrop = crops.find((entry) => entry.crop === selectedCrop) || crops[0] || null;
  const cropName = activeCrop?.crop || '';
  const detailKey = `${cropName}|${municipality}|${period}|${customDate}`;

  useEffect(() => {
    if (!cropName || awaitingCustomDate) return undefined;
    let cancelled = false;
    getCropForecastDetail(cropName, { period, municipality, customDate })
      .then((data) => { if (!cancelled) setDetailState({ key: detailKey, data, error: '' }); })
      .catch((error) => { if (!cancelled) setDetailState({ key: detailKey, data: null, error: error.message }); });
    return () => { cancelled = true; };
  }, [cropName, municipality, period, customDate, detailKey, awaitingCustomDate]);

  const categories = useMemo(() => {
    const available = crops.map((entry) => entry.category).filter(Boolean);
    return [...new Set([...categoryNames, ...available])];
  }, [categoryNames, crops]);

  const cropListings = useMemo(() => productsState.products.filter((product) => (
    cropName
    && product.name.trim().toLowerCase() === cropName.trim().toLowerCase()
    && (!municipality || product.location === municipality)
  )), [productsState.products, cropName, municipality]);

  const detailIsCurrent = detailState.key === detailKey;
  const detailLoading = Boolean(cropName) && !detailIsCurrent;
  const detail = detailIsCurrent ? detailState.data : null;
  const detailError = detailIsCurrent ? detailState.error : '';
  const demandChart = mergeSeries(detail?.demandHistoricalChart, detail?.demandForecastCurve, 'volume', 'volume');
  const priceChart = mergeSeries(detail?.historicalChart, detail?.forecastCurve, 'price', 'price');

  return (
    <AppShell
      user={currentUser}
      navItems={adminNavItems}
      title="Demand Forecast"
      subtitle="Monitor marketplace demand and commodity price conditions."
      pageClassName="admin-demand-forecast"
    >
      <PageHeader title="Demand Forecast" description="Review demand signals, market movement, and Farmer listings using the shared forecast data." />
      <div className="admin-forecast-filters" aria-label="Forecast filters">
        <label>
          Commodity category
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        {period === 'custom' ? (
          <label>
            Forecast date
            <input type="date" min={minimumCustomDate()} value={customDate} onChange={(event) => setCustomDate(event.target.value)} />
          </label>
        ) : null}
        <label>
          Location
          <select value={municipality} onChange={(event) => setMunicipality(event.target.value)}>
            <option value="">All locations</option>
            {CEBU_MUNICIPALITIES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label>
          Forecast period
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            {(listData?.periods || [{ value: DEFAULT_PERIOD, label: 'Next 7 Days' }]).map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        <p className="admin-forecast-generated">
          Last updated: {listData?.generatedAt ? formatDate(listData.generatedAt) : 'Data unavailable'}
        </p>
      </div>

      {listError ? <div className="form-alert error" role="alert">{listError}</div> : null}
      {listLoading ? <LoadingState rows={4} /> : null}
      {awaitingCustomDate ? <p className="admin-forecast-empty">Choose a future date to load the forecast.</p> : null}

      {listData && !crops.length ? (
        <p className="admin-forecast-empty">No marketplace demand data is available for these filters.</p>
      ) : null}

      {listData && crops.length ? (
        <>
          <section className="admin-forecast-table-section" aria-labelledby="admin-forecast-crops-heading">
            <div className="admin-forecast-section-heading">
              <div>
                <h2 id="admin-forecast-crops-heading">Commodity demand and price monitoring</h2>
                <p>Select a commodity to review its forecast and matching Farmer listings.</p>
              </div>
              <span>{crops.length} commodities</span>
            </div>
            <div className="admin-forecast-table-wrap" role="region" aria-label="Commodity forecast table" tabIndex="0">
              <table>
                <thead><tr>
                  <th>Commodity</th><th>Recent orders</th><th>Active listings</th><th>Demand</th><th>Reference price</th><th>Expected change</th><th>Market trend</th><th>Confidence</th>
                </tr></thead>
                <tbody>{crops.map((entry) => (
                  <tr key={entry.crop} className={entry.crop === cropName ? 'is-selected' : ''}>
                    <td><button type="button" onClick={() => setSelectedCrop(entry.crop)} aria-pressed={entry.crop === cropName}>{entry.crop}</button></td>
                    <td>{displayValue(entry.orderCount)}</td>
                    <td>{displayValue(entry.activeListings)}</td>
                    <td>{displayValue(entry.forecastDemand)}</td>
                    <td>{entry.referencePrice == null ? 'Data unavailable' : `${formatCurrency(entry.referencePrice)}${entry.unit ? `/${entry.unit}` : ''}`}</td>
                    <td>{percentValue(entry.expectedChangePercent)}</td>
                    <td>{marketTrendValue(entry)}</td>
                    <td>{entry.confidence == null ? 'Data unavailable' : `${entry.confidence}%`}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <section className="admin-forecast-detail" aria-labelledby="admin-forecast-detail-heading">
            <div className="admin-forecast-section-heading">
              <div>
                <h2 id="admin-forecast-detail-heading">{cropName}</h2>
                <p>{municipality || 'All locations'} · {detail?.periodLabel || listData.periodLabel || 'Forecast period unavailable'}</p>
              </div>
              {detailLoading ? <span role="status">Loading forecast details…</span> : null}
            </div>
            {detailError ? <p className="form-alert warning" role="status">Forecast details unavailable: {detailError}</p> : null}
            <dl className="admin-forecast-metrics">
              <div><dt>Current reference price</dt><dd>{activeCrop.referencePrice == null ? 'Data unavailable' : `${formatCurrency(activeCrop.referencePrice)}${activeCrop.unit ? `/${activeCrop.unit}` : ''}`}</dd></div>
              <div><dt>Expected demand</dt><dd>{displayValue(activeCrop.forecastDemand)}</dd></div>
              <div><dt>Expected change</dt><dd>{percentValue(activeCrop.expectedChangePercent)}</dd></div>
              <div><dt>Market trend</dt><dd>{marketTrendValue(activeCrop)}</dd></div>
              <div><dt>Weather impact</dt><dd>{weatherImpactValue(detail?.weatherImpact)}</dd></div>
              <div><dt>Forecast confidence</dt><dd>{activeCrop.confidence == null ? 'Data unavailable' : `${activeCrop.confidence}%`}</dd></div>
            </dl>
            <div className="admin-forecast-chart-grid">
              <ForecastLineChart
                title="Demand trend"
                description="Observed order volume and projected demand"
                data={demandChart}
                unit="demand"
                historyLabel="Observed"
                forecastLabel="Forecast"
              />
              <ForecastLineChart
                title="Price trend"
                description="Historical prices and projected reference"
                data={priceChart}
                unit="price"
                historyLabel="Historical"
                forecastLabel="Forecast"
              />
            </div>
          </section>

          <section className="admin-forecast-listings" aria-labelledby="admin-forecast-listings-heading">
            <div className="admin-forecast-section-heading">
              <div>
                <h2 id="admin-forecast-listings-heading">Farmer listings for {cropName}</h2>
                <p>Review submitted selling prices alongside the forecast. Forecast values do not approve or change prices.</p>
              </div>
              <span>{productsState.loading ? 'Loading…' : `${cropListings.length} listings`}</span>
            </div>
            {productsState.error ? <p className="form-alert error" role="alert">{productsState.error}</p> : null}
            {!productsState.loading && !productsState.error ? (
              cropListings.length ? (
                <div className="admin-forecast-table-wrap" role="region" aria-label="Farmer commodity listings" tabIndex="0">
                  <table>
                    <thead><tr><th>Farmer</th><th>Submitted price</th><th>Stock</th><th>Listing status</th><th>Price review</th><th>Updated</th></tr></thead>
                    <tbody>{cropListings.map((product) => (
                      <tr key={product.id}>
                        <td>{product.farmerName || 'Farmer unavailable'}</td>
                        <td>{formatCurrency(product.price)}/{product.unit}</td>
                        <td>{product.quantity} {product.unit}</td>
                        <td>{product.status}</td>
                        <td>{priceReviewLabel(product.priceReview?.status)}</td>
                        <td>{product.updatedAt ? formatDate(product.updatedAt) : 'Data unavailable'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="admin-forecast-empty">No Farmer listings match this commodity and location.</p>
            ) : null}
          </section>
        </>
      ) : null}
    </AppShell>
  );
}
