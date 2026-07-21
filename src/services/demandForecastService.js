import { apiClient } from './apiClient';

// Real backend now (see backend/src/controllers/forecast.controller.js) — replaces the old
// localStorage-backed, pre-migration version of this file. Returns one row per crop (not
// the broader category taxonomy), with the "current market" fields always populated from
// real Supabase data, and the forecast-specific fields (forecastPrice, forecastDemand,
// confidence, weatherImpact, harvestSeason, recommendation) explicitly null with
// forecastPending: true until ForecastAPI/OpenWeatherMap/OpenAI are wired in.
export async function getDemandForecast({ category = '', municipality = '', daysBack = 90 } = {}) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (municipality) params.set('municipality', municipality);
  if (daysBack) params.set('daysBack', String(daysBack));
  const query = params.toString();
  return apiClient.get(`/forecast/demand${query ? `?${query}` : ''}`);
}

export const DEMAND_SIGNAL_LABELS = {
  opportunity: 'Demand outpacing supply',
  steady: 'Demand met by current supply',
  none: 'No recent buyer demand',
};
