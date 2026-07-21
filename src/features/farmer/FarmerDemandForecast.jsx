import { useEffect, useMemo, useState } from 'react';
import {
  BadgePercent, ChevronDown, CloudRain, Droplets, DollarSign, Gauge, Info, PackageSearch,
  Sparkles, Thermometer, TrendingUp, Wheat, Wind,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell';
import StatCard from '../../components/cards/StatCard';
import DataTable from '../../components/dashboard/DataTable';
import EmptyState from '../../components/common/EmptyState';
import SupplyDemandChart from '../../components/charts/SupplyDemandChart';
import { useAuth } from '../auth/AuthContext';
import { useCatalog } from '../../contexts/CatalogContext';
import { getDemandForecast } from '../../services/demandForecastService';
import { CEBU_MUNICIPALITIES } from '../../utils/constants';
import { formatCurrency } from '../../utils/formatters';
import { farmerNavItems } from './farmerNav';

const STATUS_TONE_CLASS = {
  'High Opportunity': 'forecast-status-opportunity',
  'Stable Market': 'forecast-status-stable',
  'Low Demand': 'forecast-status-low',
  'High Risk': 'forecast-status-risk',
};

const DEMAND_LEVEL_OPTIONS = [
  { value: '', label: 'All demand levels' },
  { value: 'opportunity', label: 'High opportunity' },
  { value: 'steady', label: 'Stable' },
  { value: 'none', label: 'Low demand' },
];

// A single, clearly-labeled panel for the handful of items that are genuinely still
// time-series charts, not point-in-time values — Forecast Price, Confidence Score, and
// Harvest Season are all real, computed numbers now (see the rule-based engine in
// backend/src/lib/forecastEngine.js); what's still missing is trend-over-time
// visualizations of them, which would need a real forecast history to chart against.
function PendingChartsPanel() {
  return (
    <div className="panel forecast-pending-panel">
      <div className="forecast-pending-icon"><Info size={20} /></div>
      <div>
        <h3>Trend visualizations pending</h3>
        <p className="muted">
          Historical-vs-forecast price trend lines, a forecast demand trend, and a harvest season timeline need a
          multi-point forecast history to chart — everything else on this page, including Forecast Price,
          Confidence Score, and Harvest Season themselves, is already computed from real HarvestLink data.
        </p>
      </div>
    </div>
  );
}

// A plain, transparent bucketing of OpenWeatherMap's real rainfall-probability percentage.
function rainRiskLevel(rainfallProbability) {
  if (rainfallProbability == null) return null;
  if (rainfallProbability >= 60) return 'High';
  if (rainfallProbability >= 30) return 'Moderate';
  return 'Low';
}

export default function FarmerDemandForecast() {
  const { currentUser } = useAuth();
  const { categoryNames } = useCatalog();
  const [category, setCategory] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [demandLevel, setDemandLevel] = useState('');
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    getDemandForecast({ category, municipality })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [category, municipality]);

  const crops = useMemo(() => data?.crops || [], [data]);
  const weather = data?.weather || null;
  // Same backward-compat reasoning as Marketplace/FarmerProducts — a crop whose product row
  // still carries a renamed/deactivated category shouldn't become impossible to isolate here.
  const categoryOptions = useMemo(() => {
    const extra = crops.map((entry) => entry.category).filter((value) => value && !categoryNames.includes(value));
    return [...categoryNames, ...new Set(extra)];
  }, [crops, categoryNames]);

  const filtered = useMemo(() => {
    return crops.filter((entry) => !demandLevel || entry.signal === demandLevel);
  }, [crops, demandLevel]);

  if (data === null && !loadError) {
    return (
      <AppShell user={currentUser} navItems={farmerNavItems} title="Demand forecast">
        <p className="muted">Loading forecast…</p>
      </AppShell>
    );
  }

  const highDemandCrops = filtered.filter((entry) => entry.signal === 'opportunity');
  const bestToPlant = [...highDemandCrops].sort((a, b) => b.demandPerListing - a.demandPerListing).slice(0, 3);
  const bestToHarvest = filtered.filter((entry) => entry.harvestSeason === 'Active').slice(0, 3);
  // Highest-opportunity crop by real order volume — falls back to the single highest-volume
  // crop overall when nothing currently reads as an opportunity.
  const featured = highDemandCrops[0] || filtered[0] || null;

  const pricedCrops = filtered.filter((entry) => entry.forecastPrice != null);
  const averageForecastPrice = pricedCrops.length
    ? pricedCrops.reduce((sum, entry) => sum + entry.forecastPrice, 0) / pricedCrops.length
    : null;
  const risingCount = pricedCrops.filter((entry) => entry.forecastPrice > entry.currentPrice).length;
  const fallingCount = pricedCrops.filter((entry) => entry.forecastPrice < entry.currentPrice).length;
  const marketTrend = !pricedCrops.length
    ? '—'
    : risingCount > fallingCount ? 'Rising' : fallingCount > risingCount ? 'Softening' : 'Steady';
  const averageConfidence = filtered.length
    ? Math.round(filtered.reduce((sum, entry) => sum + (entry.confidence || 0), 0) / filtered.length)
    : null;

  const supplyDemandData = filtered.slice(0, 8).map((entry) => ({
    key: entry.crop,
    label: entry.crop,
    supply: entry.activeListings,
    demand: entry.quantityOrdered,
  }));

  return (
    <AppShell
      user={currentUser}
      navItems={farmerNavItems}
      title="Demand forecast"
      subtitle="Real-time market demand, live weather, and rule-based price/demand forecasts across HarvestLink, crop by crop."
    >
      {loadError ? <div className="form-alert error">{loadError}</div> : null}

      <section className="panel forecast-filters">
        <div className="forecast-filters-row">
          <label className="location-filter" htmlFor="forecast-category">
            <PackageSearch size={16} />
            <select id="forecast-category" value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">All categories</option>
              {categoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="location-filter" htmlFor="forecast-municipality">
            <Wheat size={16} />
            <select id="forecast-municipality" value={municipality} onChange={(event) => setMunicipality(event.target.value)}>
              <option value="">All municipalities</option>
              {CEBU_MUNICIPALITIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="location-filter" htmlFor="forecast-demand-level">
            <TrendingUp size={16} />
            <select id="forecast-demand-level" value={demandLevel} onChange={(event) => setDemandLevel(event.target.value)}>
              {DEMAND_LEVEL_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
        </div>
        <div className="forecast-filters-row forecast-filters-pending">
          <span className="forecast-pending-filter" title="Needs a multi-period forecast history">
            Forecast period <ChevronDown size={13} />
          </span>
        </div>
      </section>

      <section className="stats-grid forecast-summary-grid">
        <StatCard label="Forecasted High-Demand Crops" value={highDemandCrops.length} icon={<Sparkles size={20} />} />
        <StatCard
          label="Average Forecast Price"
          value={averageForecastPrice != null ? formatCurrency(averageForecastPrice) : '—'}
          icon={<DollarSign size={20} />}
        />
        <StatCard
          label="Best Crops to Plant"
          value={bestToPlant.length ? bestToPlant.map((entry) => entry.crop).join(', ') : '—'}
          icon={<Sparkles size={20} />}
        />
        <StatCard
          label="Best Crops to Harvest"
          value={bestToHarvest.length ? bestToHarvest.map((entry) => entry.crop).join(', ') : '—'}
          hint="Active-season crops with the most current listings"
          icon={<Wheat size={20} />}
        />
        <StatCard label="Market Trend" value={marketTrend} hint={pricedCrops.length ? `${risingCount} rising, ${fallingCount} falling` : undefined} icon={<TrendingUp size={20} />} />
        <StatCard label="Confidence Score" value={averageConfidence != null ? `${averageConfidence}%` : '—'} hint="Average across shown crops" icon={<Gauge size={20} />} />
        <StatCard
          label="Weather Risk"
          value={weather ? `${rainRiskLevel(weather.rainfallProbability)} rain risk` : '—'}
          hint={weather ? `${weather.municipality} · ${weather.condition?.main || 'Unknown'}` : 'OpenWeatherMap not configured'}
          icon={<CloudRain size={20} />}
        />
      </section>

      {weather ? (
        <section className="panel forecast-weather-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Live conditions</p>
              <h2>Weather in {weather.municipality}</h2>
            </div>
            <span className="muted forecast-weather-condition">{weather.condition?.description || weather.condition?.main}</span>
          </div>
          <div className="forecast-weather-grid">
            <div>
              <Thermometer size={18} />
              <div>
                <span>Current Temp</span>
                <strong>{weather.currentTemp}°C</strong>
              </div>
            </div>
            <div>
              <Thermometer size={18} />
              <div>
                <span>Forecast Temp (~24h)</span>
                <strong>{weather.forecastTemp != null ? `${weather.forecastTemp}°C` : '—'}</strong>
              </div>
            </div>
            <div>
              <CloudRain size={18} />
              <div>
                <span>Rainfall Probability</span>
                <strong>{weather.rainfallProbability != null ? `${weather.rainfallProbability}%` : '—'}</strong>
              </div>
            </div>
            <div>
              <Droplets size={18} />
              <div>
                <span>Humidity</span>
                <strong>{weather.humidity}%</strong>
              </div>
            </div>
            <div>
              <Wind size={18} />
              <div>
                <span>Wind Speed</span>
                <strong>{weather.windSpeedKmh} km/h</strong>
              </div>
            </div>
          </div>
          <p className="muted forecast-weather-note">
            Real current/forecast conditions from OpenWeatherMap, factored directly into every crop's Forecast
            Price and Weather Impact below.
          </p>
        </section>
      ) : null}

      {featured ? (
        <section className="panel forecast-featured">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Featured opportunity</p>
              <h2>{featured.crop}</h2>
            </div>
            <span className={`forecast-status-badge ${STATUS_TONE_CLASS[featured.status] || ''}`}>
              <BadgePercent size={14} /> {featured.status}
            </span>
          </div>
          <div className="forecast-featured-grid">
            <div>
              <span>Current Price</span>
              <strong>{featured.currentPrice != null ? `${formatCurrency(featured.currentPrice)}/unit` : '—'}</strong>
            </div>
            <div>
              <span>Forecast Price</span>
              <strong>{featured.forecastPrice != null ? `${formatCurrency(featured.forecastPrice)}/unit` : '—'}</strong>
            </div>
            <div>
              <span>Expected Demand</span>
              <strong>{featured.forecastDemand}</strong>
            </div>
            <div>
              <span>Confidence</span>
              <strong>{featured.confidence}%</strong>
            </div>
            <div>
              <span>Harvest Season</span>
              <strong>{featured.harvestSeason}</strong>
            </div>
            <div>
              <span>Weather</span>
              <strong>{weather ? `${weather.currentTemp}°C, ${weather.condition?.main || 'Unknown'}` : '—'}</strong>
            </div>
          </div>
          <p className="forecast-recommendation"><Info size={15} /> {featured.recommendation}</p>
          <p className="forecast-explanation">{featured.explanation}</p>
        </section>
      ) : null}

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Visualization</p>
            <h2>Supply vs. demand by crop</h2>
          </div>
        </div>
        <SupplyDemandChart data={supplyDemandData} />
      </section>

      <PendingChartsPanel />

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Detail</p>
            <h2>Forecast by crop</h2>
          </div>
        </div>
        <DataTable
          columns={[
            { key: 'crop', label: 'Crop', render: (row) => <strong>{row.crop}</strong> },
            { key: 'currentPrice', label: 'Current Price', render: (row) => (row.currentPrice != null ? formatCurrency(row.currentPrice) : '—') },
            { key: 'forecastPrice', label: 'Forecast Price', render: (row) => (row.forecastPrice != null ? formatCurrency(row.forecastPrice) : '—') },
            {
              key: 'priceDifference',
              label: 'Price Difference',
              render: (row) => {
                if (row.priceDifference == null) return '—';
                const sign = row.priceDifference > 0 ? '+' : '';
                return <span className={row.priceDifference > 0 ? 'forecast-diff-up' : row.priceDifference < 0 ? 'forecast-diff-down' : ''}>{sign}{formatCurrency(row.priceDifference)}</span>;
              },
            },
            {
              key: 'currentDemand',
              label: 'Current Demand',
              render: (row) => (row.signal === 'opportunity' ? 'High' : row.signal === 'steady' ? 'Steady' : 'Low'),
            },
            { key: 'forecastDemand', label: 'Forecast Demand', render: (row) => row.forecastDemand },
            { key: 'confidence', label: 'Confidence', render: (row) => `${row.confidence}%` },
            { key: 'weatherImpact', label: 'Weather Impact', render: (row) => <span className="forecast-table-note">{row.weatherImpact}</span> },
            { key: 'harvestSeason', label: 'Harvest Season', render: (row) => row.harvestSeason },
            { key: 'recommendation', label: 'Recommendation', render: (row) => <span className="forecast-table-note">{row.recommendation}</span> },
            {
              key: 'status',
              label: 'Status',
              render: (row) => <span className={`forecast-status-badge ${STATUS_TONE_CLASS[row.status] || ''}`}>{row.status}</span>,
            },
          ]}
          rows={filtered.map((entry) => ({ ...entry, id: entry.crop }))}
          emptyMessage="No crops match these filters yet."
        />
      </section>

      {!crops.length ? (
        <EmptyState
          title="No market activity yet"
          message="Once buyers start ordering and farmers start listing produce, forecasts will appear here."
        />
      ) : null}
    </AppShell>
  );
}
