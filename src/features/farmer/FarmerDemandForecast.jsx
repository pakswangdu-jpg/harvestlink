import { useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import EmptyState from '../../components/common/EmptyState';
import ForecastFilters from '../../components/forecast/ForecastFilters';
import ForecastKpiGrid from '../../components/forecast/ForecastKpiGrid';
import WeatherPanel from '../../components/forecast/WeatherPanel';
import SupplyDemandBarChart from '../../components/charts/SupplyDemandBarChart';
import ForecastTable from '../../components/forecast/ForecastTable';
import MarketAnalysisReport from '../../components/forecast/MarketAnalysisReport';
import ForecastSkeleton from '../../components/forecast/ForecastSkeleton';
import { useAuth } from '../auth/AuthContext';
import { useCatalog } from '../../contexts/CatalogContext';
import { getCropForecastDetail, getDemandForecast } from '../../services/demandForecastService';
import { farmerNavItems } from './farmerNav';
import './FarmerDemandForecast.css';


function rainRiskLevel(rainfallProbability) {
  if (rainfallProbability == null) return 'Unavailable';
  if (rainfallProbability >= 60) return 'High';
  if (rainfallProbability >= 30) return 'Medium';
  return 'Low';
}

function formatLastUpdated(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Not available';
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(new Date(value));
}

function formatPrice(value, unit) {
  if (value == null) return null;
  return `${new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2,
  }).format(value)}${unit ? `/${unit}` : ''}`;
}

function formatPercentChange(value) {
  if (value == null) return null;
  const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '→';
  return `${arrow} ${value > 0 ? '+' : ''}${value}%`;
}

export default function FarmerDemandForecast() {
  const { currentUser } = useAuth();
  const { categoryNames } = useCatalog();
  const [category, setCategory] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [demandLevel, setDemandLevel] = useState('');
  const [period, setPeriod] = useState('7_days');
  const [customDate, setCustomDate] = useState('');
  const [selectedCropOverride, setSelectedCropOverride] = useState('');
  const comparisonRef = useRef(null);
  const detailRef = useRef(null);







  const [listResult, setListResult] = useState({ key: '', data: null, error: '' });
  const [refreshToken, setRefreshToken] = useState(0);
  const isAwaitingCustomDate = period === 'custom' && !customDate;
  const listRequestKey = `${category}|${municipality}|${period}|${customDate}|${refreshToken}`;
  const isRefreshing = !isAwaitingCustomDate && listResult.key !== listRequestKey;
  const data = listResult.data;
  const loadError = listResult.error;

  useEffect(() => {
    if (isAwaitingCustomDate) return undefined;
    let cancelled = false;
    getDemandForecast({ category, municipality, period, customDate })
      .then((result) => {
        if (!cancelled) setListResult({ key: listRequestKey, data: result, error: '' });
      })
      .catch((error) => {
        if (!cancelled) setListResult((previous) => ({ key: listRequestKey, data: previous.data, error: error.message }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, municipality, period, customDate, refreshToken, isAwaitingCustomDate]);

  const crops = useMemo(() => data?.crops || [], [data]);
  const weather = data?.weather || null;
  const periods = data?.periods || [];
  const periodLabel = data?.periodLabel || '';
  const weatherRiskLevel = weather ? rainRiskLevel(weather.rainfallProbability) : 'Unavailable';



  const categoryOptions = useMemo(() => {
    const extra = crops.map((entry) => entry.category).filter((value) => value && !categoryNames.includes(value));
    return [...categoryNames, ...new Set(extra)];
  }, [crops, categoryNames]);

  const filtered = useMemo(() => {
    return crops.filter((entry) => !demandLevel || entry.signal === demandLevel);
  }, [crops, demandLevel]);

  const highDemandCrops = crops.filter((entry) => entry.signal === 'opportunity');
  const bestOpportunity = [...highDemandCrops].sort((a, b) => (
    (b.demandPerListing || 0) - (a.demandPerListing || 0)
    || (b.quantityOrdered || 0) - (a.quantityOrdered || 0)
  ))[0] || null;
  const featured = bestOpportunity || filtered[0] || null;





  const selectedCrop = filtered.some((entry) => entry.crop === selectedCropOverride)
    ? selectedCropOverride
    : (featured?.crop || filtered[0]?.crop || '');

  const pricedCrops = filtered.filter((entry) => entry.forecastPrice != null);
  const cropsWithPriceChange = pricedCrops.filter((entry) => entry.expectedChangePercent != null);
  const averagePriceChangePercent = cropsWithPriceChange.length
    ? Math.round((cropsWithPriceChange.reduce((sum, entry) => sum + entry.expectedChangePercent, 0) / cropsWithPriceChange.length) * 10) / 10
    : null;
  const bestCrop = [...cropsWithPriceChange].sort((a, b) => b.expectedChangePercent - a.expectedChangePercent)[0] || null;
  const risingCount = pricedCrops.filter((entry) => entry.marketTrend === 'increasing').length;
  const fallingCount = pricedCrops.filter((entry) => entry.marketTrend === 'decreasing').length;
  const marketTrend = !pricedCrops.length
    ? 'Unavailable'
    : risingCount > fallingCount ? 'Rising' : fallingCount > risingCount ? 'Falling' : 'Steady';
  const averageConfidence = filtered.length
    ? Math.round(filtered.reduce((sum, entry) => sum + (entry.confidence || 0), 0) / filtered.length)
    : null;




  const supplyDemandData = filtered.slice(0, 8).map((entry) => ({
    crop: entry.crop,
    supply: entry.activeListings,
    demand: entry.orderCount,
    signal: entry.signal,
  }));
  const lastUpdated = data?.generatedAt || null;



  const [detailResult, setDetailResult] = useState({ key: '', detail: null, error: '' });
  const detailRequestKey = `${selectedCrop}:${period}:${municipality}:${customDate}`;
  const isDetailLoading = Boolean(selectedCrop) && !isAwaitingCustomDate && detailResult.key !== detailRequestKey;
  const detail = isDetailLoading ? null : detailResult.detail;
  const detailError = isDetailLoading ? '' : detailResult.error;

  useEffect(() => {
    if (!selectedCrop || isAwaitingCustomDate) return undefined;
    let cancelled = false;
    getCropForecastDetail(selectedCrop, { period, municipality, customDate })
      .then((result) => {
        if (!cancelled) setDetailResult({ key: detailRequestKey, detail: result, error: '' });
      })
      .catch((error) => {
        if (!cancelled) setDetailResult({ key: detailRequestKey, detail: null, error: error.message });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCrop, period, municipality, customDate, isAwaitingCustomDate]);

  if (data === null && !loadError) {
    return (
      <AppShell
        user={currentUser}
        navItems={farmerNavItems}
        title="Demand Forecast"
        subtitle={`Market outlook based on marketplace activity, reference prices, and local weather${municipality ? ` in ${municipality}` : ''}.`}
        pageClassName="demand-forecast-page"
      >
        <ForecastSkeleton />
      </AppShell>
    );
  }

  return (
    <AppShell
      user={currentUser}
      navItems={farmerNavItems}
      title="Demand Forecast"
      subtitle={`Market outlook based on marketplace activity, reference prices, and local weather${municipality ? ` in ${municipality}` : ''}.`}
      pageClassName="demand-forecast-page"
    >
      <div className="demand-forecast-content flex min-w-0 flex-col gap-5">
        {loadError ? <div className="form-alert error">{loadError}</div> : null}

        <ForecastFilters
          municipality={municipality}
          onMunicipalityChange={setMunicipality}
          period={period}
          periods={periods}
          onPeriodChange={setPeriod}
          customDate={customDate}
          onCustomDateChange={setCustomDate}
          onRefresh={() => setRefreshToken((token) => token + 1)}
          isRefreshing={isRefreshing}
        />

        {!crops.length ? (
          <EmptyState
            title="No market activity yet"
            message="Forecasts will appear here once buyers place orders and farmers list produce."
            className="forecast-empty-state"
          />
        ) : (
          <>
            <section aria-labelledby="forecast-summary-heading">
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 id="forecast-summary-heading" className="text-[22px] font-semibold leading-tight text-[var(--text)]">Market summary</h2>
                  <p className="mt-1 text-[15px] text-[var(--text-secondary)]">
                    A quick view of demand, price direction, weather risk, and forecast confidence.
                  </p>
                </div>
                <p className="text-[14px] text-[var(--text-secondary)]">
                  Last updated: <time dateTime={lastUpdated || undefined}>{formatLastUpdated(lastUpdated)}</time>
                </p>
              </div>
            <ForecastKpiGrid
              highDemandCrops={highDemandCrops}
              averagePriceChangePercent={averagePriceChangePercent}
              bestCrop={bestCrop}
              marketTrend={marketTrend}
              weather={weather}
              weatherRiskLevel={weatherRiskLevel}
              averageConfidence={averageConfidence}
              periodLabel={periodLabel}
              onViewHighDemand={() => {
                setDemandLevel('opportunity');
                comparisonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />
            </section>

            <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
              <WeatherPanel weather={weather} isLoading={isRefreshing} />
              <section className="min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-6" aria-labelledby="forecast-opportunity-heading">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-semibold text-[var(--green-700)]">Best opportunity</p>
                    <h2 id="forecast-opportunity-heading" className="mt-1 text-[22px] font-semibold text-[var(--text)]">
                      {bestOpportunity?.crop || 'No high-demand crop identified'}
                    </h2>
                  </div>
                  {bestOpportunity ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCropOverride(bestOpportunity.crop);
                        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className="min-h-11 rounded-md border border-[var(--line)] bg-[var(--panel)] px-4 text-[14px] font-semibold text-[var(--green-700)] hover:bg-[var(--soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--green-600)]"
                    >
                      View detailed forecast
                    </button>
                  ) : null}
                </div>
                {bestOpportunity ? (
                  <>
                    <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[var(--line)] pt-4 sm:grid-cols-3">
                      {bestOpportunity.orderCount != null ? <div><dt className="text-[13px] text-[var(--text-secondary)]">Buyer orders</dt><dd className="mt-1 text-[16px] font-semibold text-[var(--text)]">{bestOpportunity.orderCount}</dd></div> : null}
                      {bestOpportunity.activeListings != null ? <div><dt className="text-[13px] text-[var(--text-secondary)]">Active listings</dt><dd className="mt-1 text-[16px] font-semibold text-[var(--text)]">{bestOpportunity.activeListings}</dd></div> : null}
                      {bestOpportunity.currentDemand ? <div><dt className="text-[13px] text-[var(--text-secondary)]">Demand level</dt><dd className="mt-1 text-[16px] font-semibold text-[var(--text)]">{bestOpportunity.currentDemand}</dd></div> : null}
                      {formatPrice(bestOpportunity.referencePrice, bestOpportunity.unit) ? <div><dt className="text-[13px] text-[var(--text-secondary)]">Reference price</dt><dd className="mt-1 text-[16px] font-semibold text-[var(--text)]">{formatPrice(bestOpportunity.referencePrice, bestOpportunity.unit)}</dd></div> : null}
                      {formatPrice(bestOpportunity.forecastPrice, bestOpportunity.unit) ? <div><dt className="text-[13px] text-[var(--text-secondary)]">Forecast reference</dt><dd className="mt-1 text-[16px] font-semibold text-[var(--text)]">{formatPrice(bestOpportunity.forecastPrice, bestOpportunity.unit)}</dd></div> : null}
                      {formatPercentChange(bestOpportunity.expectedChangePercent) ? <div><dt className="text-[13px] text-[var(--text-secondary)]">Expected price change</dt><dd className="mt-1 text-[16px] font-semibold text-[var(--text)]">{formatPercentChange(bestOpportunity.expectedChangePercent)}</dd></div> : null}
                      {bestOpportunity.marketTrend ? <div><dt className="text-[13px] text-[var(--text-secondary)]">Market trend</dt><dd className="mt-1 text-[16px] font-semibold text-[var(--text)]">{bestOpportunity.marketTrend}</dd></div> : null}
                    </dl>
                    <p className="mt-4 rounded-md bg-[var(--soft)] px-4 py-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--text)]">Market opportunity: </span>
                      Buyer demand for {bestOpportunity.crop} is outpacing active listings. This may indicate a stronger selling opportunity; it does not guarantee a sale or profit.
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-[15px] leading-relaxed text-[var(--text-secondary)]">
                    No crop currently meets the forecast’s high-demand signal for this selection.
                  </p>
                )}
              </section>
            </div>

            <SupplyDemandBarChart data={supplyDemandData} />

            <div ref={comparisonRef} className="scroll-mt-6">
              <ForecastTable
                crops={filtered}
                selectedCrop={selectedCrop}
                onSelectCrop={setSelectedCropOverride}
                category={category}
                onCategoryChange={setCategory}
                categoryOptions={categoryOptions}
                demandLevel={demandLevel}
                onDemandLevelChange={setDemandLevel}
              />
            </div>

            {detailError ? <div className="form-alert error">{detailError}</div> : null}
            <div ref={detailRef} className="scroll-mt-6">
              {isDetailLoading ? (
                <ForecastSkeleton />
              ) : (
                <MarketAnalysisReport detail={detail} municipality={municipality} periodLabel={periodLabel} />
              )}
            </div>
            <section className="border-t border-[var(--line)] pt-4" aria-labelledby="forecast-about-title">
              <h2 id="forecast-about-title" className="text-[18px] font-semibold text-[var(--text)]">About this forecast</h2>
              <p className="mt-1 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                Forecasts are estimates based on available marketplace activity, reference pricing, and weather information. Actual market demand and prices may vary. Price changes do not include growing or selling costs and are not profit estimates.
              </p>
              <p className="mt-3 text-[14px] leading-relaxed text-[var(--text-secondary)]">
                <span className="font-semibold text-[var(--text)]">Data sources: </span>
                HarvestLink marketplace orders and listings · available listing and order price history
                {weather ? ' · OpenWeather' : ''}
                {' · PSA farmgate price trends where available'}
              </p>
              <p className="mt-2 text-[13px] text-[var(--muted)]">
                Last updated: <time dateTime={lastUpdated || undefined}>{formatLastUpdated(lastUpdated)}</time>
              </p>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
