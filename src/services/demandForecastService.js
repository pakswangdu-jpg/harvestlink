import { apiClient } from './apiClient';

// Real backend now (see backend/src/controllers/forecast.controller.js) — one row per crop
// (not the broader category taxonomy), enriched with the full price/demand projection for
// whichever `period` is selected. Every field always traces to real Supabase order/listing
// data, real OpenWeatherMap conditions, and real PSA reference prices.
export async function getDemandForecast({ category = '', municipality = '', daysBack = 90, period = '' } = {}) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (municipality) params.set('municipality', municipality);
  if (daysBack) params.set('daysBack', String(daysBack));
  if (period) params.set('period', period);
  const query = params.toString();
  return apiClient.get(`/forecast/demand${query ? `?${query}` : ''}`);
}

// Drill-down for one crop — full historical/forecast price + demand curves and a
// Gemini-written summary/recommendation of the already-computed numbers (see
// getCropForecastDetail in the same controller).
export function getCropForecastDetail(cropName, { period = '', municipality = '' } = {}) {
  const params = new URLSearchParams();
  if (period) params.set('period', period);
  if (municipality) params.set('municipality', municipality);
  const query = params.toString();
  return apiClient.get(`/forecast/demand/${encodeURIComponent(cropName)}${query ? `?${query}` : ''}`);
}

export const DEMAND_SIGNAL_LABELS = {
  opportunity: 'Demand outpacing supply',
  steady: 'Demand met by current supply',
  none: 'No recent buyer demand',
};
