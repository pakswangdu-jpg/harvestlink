import { useEffect, useMemo, useState } from 'react';
import AppShell from '../../components/layout/AppShell';
import EmptyState from '../../components/common/EmptyState';
import ForecastHeader from '../../components/forecast/ForecastHeader';
import ForecastKpiGrid from '../../components/forecast/ForecastKpiGrid';
import AiRecommendationHero from '../../components/forecast/AiRecommendationHero';
import WeatherPanel from '../../components/forecast/WeatherPanel';
import SupplyDemandBarChart from '../../components/charts/SupplyDemandBarChart';
import ForecastTable from '../../components/forecast/ForecastTable';
import CropDetailPanel from '../../components/forecast/CropDetailPanel';
import InteractiveForecastChart from '../../components/forecast/InteractiveForecastChart';
import RecommendationCard from '../../components/forecast/RecommendationCard';
import ForecastSkeleton from '../../components/forecast/ForecastSkeleton';
import { useAuth } from '../auth/AuthContext';
import { useCatalog } from '../../contexts/CatalogContext';
import { getCropForecastDetail, getDemandForecast } from '../../services/demandForecastService';
import { farmerNavItems } from './farmerNav';

// A plain, transparent bucketing of OpenWeatherMap's real rainfall-probability percentage.
function rainRiskLevel(rainfallProbability) {
  if (rainfallProbability == null) return 'Low';
  if (rainfallProbability >= 60) return 'High';
  if (rainfallProbability >= 30) return 'Medium';
  return 'Low';
}

export default function FarmerDemandForecast() {
  const { currentUser } = useAuth();
  const { categoryNames } = useCatalog();
  const [category, setCategory] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [demandLevel, setDemandLevel] = useState('');
  const [period, setPeriod] = useState('30_days');
  const [selectedCropOverride, setSelectedCropOverride] = useState('');

  // List fetch — same effect this page has always run (category/municipality/period), now
  // also re-triggered by the header's Refresh button via `refreshToken`, and tracking its
  // own request key so a refresh never blanks out the previously-loaded dashboard while
  // the new response is in flight.
  const [listResult, setListResult] = useState({ key: '', data: null, error: '' });
  const [refreshToken, setRefreshToken] = useState(0);
  const listRequestKey = `${category}|${municipality}|${period}|${refreshToken}`;
  const isRefreshing = listResult.key !== listRequestKey;
  const data = listResult.data;
  const loadError = listResult.error;

  useEffect(() => {
    let cancelled = false;
    getDemandForecast({ category, municipality, period })
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
  }, [category, municipality, period, refreshToken]);

  const crops = useMemo(() => data?.crops || [], [data]);
  const weather = data?.weather || null;
  const periods = data?.periods || [];
  const periodLabel = data?.periodLabel || '';
  const weatherRiskLevel = weather ? rainRiskLevel(weather.rainfallProbability) : 'Low';

  // Same backward-compat reasoning as Marketplace/FarmerProducts — a crop whose product row
  // still carries a renamed/deactivated category shouldn't become impossible to isolate here.
  const categoryOptions = useMemo(() => {
    const extra = crops.map((entry) => entry.category).filter((value) => value && !categoryNames.includes(value));
    return [...categoryNames, ...new Set(extra)];
  }, [crops, categoryNames]);

  const filtered = useMemo(() => {
    return crops.filter((entry) => !demandLevel || entry.signal === demandLevel);
  }, [crops, demandLevel]);

  const highDemandCrops = filtered.filter((entry) => entry.signal === 'opportunity');
  const featured = highDemandCrops[0] || filtered[0] || null;

  // Derived, not synced via an effect: the user's clicked-row/card override wins as long as
  // it's still present in the currently filtered list; otherwise falls back to the
  // featured/top crop, so a filter change that makes the old selection disappear
  // re-anchors for free.
  const selectedCrop = filtered.some((entry) => entry.crop === selectedCropOverride)
    ? selectedCropOverride
    : (featured?.crop || filtered[0]?.crop || '');
  const selectedForecast = filtered.find((entry) => entry.crop === selectedCrop) || null;

  const pricedCrops = filtered.filter((entry) => entry.forecastPrice != null);
  const averageForecastPrice = pricedCrops.length
    ? pricedCrops.reduce((sum, entry) => sum + entry.forecastPrice, 0) / pricedCrops.length
    : null;
  const averageCurrentPrice = pricedCrops.length
    ? pricedCrops.reduce((sum, entry) => sum + entry.currentPrice, 0) / pricedCrops.length
    : null;
  const averagePriceChangePercent = averageForecastPrice != null && averageCurrentPrice
    ? Math.round(((averageForecastPrice - averageCurrentPrice) / averageCurrentPrice) * 1000) / 10
    : null;
  const bestCrop = [...pricedCrops].sort((a, b) => (b.expectedChangePercent || 0) - (a.expectedChangePercent || 0))[0] || null;
  const risingCount = pricedCrops.filter((entry) => entry.marketTrend === 'increasing').length;
  const fallingCount = pricedCrops.filter((entry) => entry.marketTrend === 'decreasing').length;
  const marketTrend = !pricedCrops.length
    ? 'Steady'
    : risingCount > fallingCount ? 'Rising' : fallingCount > risingCount ? 'Falling' : 'Steady';
  const averageConfidence = filtered.length
    ? Math.round(filtered.reduce((sum, entry) => sum + (entry.confidence || 0), 0) / filtered.length)
    : null;

  // Both sides are real COUNTS (number of orders vs. number of active listings) — not
  // order count vs. total quantity ordered, which would compare two different units and
  // make the bars meaningless next to each other (see SupplyDemandBarChart.jsx).
  const supplyDemandData = filtered.slice(0, 8).map((entry) => ({
    crop: entry.crop, supply: entry.activeListings, demand: entry.orderCount,
  }));

  // Crop-detail drill-down — same "track the key it was fetched for" derived-loading
  // pattern already used by this page (and originally the retired Price Forecast page).
  const [detailResult, setDetailResult] = useState({ key: '', detail: null, error: '' });
  const detailRequestKey = `${selectedCrop}:${period}:${municipality}`;
  const isDetailLoading = Boolean(selectedCrop) && detailResult.key !== detailRequestKey;
  const detail = isDetailLoading ? null : detailResult.detail;
  const detailError = isDetailLoading ? '' : detailResult.error;

  useEffect(() => {
    if (!selectedCrop) return undefined;
    let cancelled = false;
    getCropForecastDetail(selectedCrop, { period, municipality })
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
  }, [selectedCrop, period, municipality]);

  if (data === null && !loadError) {
    return (
      <AppShell user={currentUser} navItems={farmerNavItems} title="Demand Forecast">
        <ForecastSkeleton />
      </AppShell>
    );
  }

  return (
    <AppShell user={currentUser} navItems={farmerNavItems} title="Demand Forecast">
      <div className="flex min-w-0 flex-col gap-6">
        {loadError ? <div className="form-alert error">{loadError}</div> : null}

        <ForecastHeader
          municipality={municipality}
          onMunicipalityChange={setMunicipality}
          period={period}
          periods={periods}
          onPeriodChange={setPeriod}
          onRefresh={() => setRefreshToken((token) => token + 1)}
          isRefreshing={isRefreshing}
        />

        {!crops.length ? (
          <EmptyState
            title="No market activity yet"
            message="Once buyers start ordering and farmers start listing produce, forecasts will appear here."
          />
        ) : (
          <>
            <ForecastKpiGrid
              highDemandCrops={highDemandCrops}
              averageForecastPrice={averageForecastPrice}
              averagePriceChangePercent={averagePriceChangePercent}
              bestCrop={bestCrop}
              marketTrend={marketTrend}
              weather={weather}
              weatherRiskLevel={weatherRiskLevel}
              averageConfidence={averageConfidence}
              periodLabel={periodLabel}
            />

            {isDetailLoading ? (
              <ForecastSkeleton />
            ) : (
              <AiRecommendationHero
                crop={selectedCrop}
                forecast={detail || selectedForecast}
                aiSummary={detail?.aiSummary}
              />
            )}
            {detailError ? <div className="form-alert error">{detailError}</div> : null}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <WeatherPanel weather={weather} isLoading={isRefreshing} />
              <SupplyDemandBarChart data={supplyDemandData} />
            </div>

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

            {isDetailLoading ? <ForecastSkeleton /> : <CropDetailPanel crop={selectedCrop} forecast={detail || selectedForecast} />}

            {isDetailLoading ? null : <InteractiveForecastChart detail={detail} forecast={selectedForecast} />}

            {isDetailLoading ? null : <RecommendationCard recommendation={detail?.aiRecommendation} />}
          </>
        )}
      </div>
    </AppShell>
  );
}
