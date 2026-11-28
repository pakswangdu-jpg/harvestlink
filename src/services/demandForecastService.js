import { apiClient } from './apiClient';





export async function getDemandForecast({
  category = '', municipality = '', daysBack = 180, period = '', customDate = '', refreshKey = 0,
} = {}) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (municipality) params.set('municipality', municipality);
  if (daysBack) params.set('daysBack', String(daysBack));
  if (period) params.set('period', period);
  if (period === 'custom' && customDate) params.set('customDate', customDate);
  if (refreshKey > 0) params.set('refresh', String(refreshKey));
  const query = params.toString();
  return apiClient.get(`/forecast/demand${query ? `?${query}` : ''}`);
}




export function getCropForecastDetail(cropName, {
  period = '', municipality = '', customDate = '', refreshKey = 0, unit, preview = false,
} = {}) {
  const params = new URLSearchParams();
  if (period) params.set('period', period);
  if (municipality) params.set('municipality', municipality);
  if (unit !== undefined && unit !== null) params.set('unit', String(unit));
  if (preview) params.set('preview', '1');
  if (period === 'custom' && customDate) params.set('customDate', customDate);
  if (refreshKey > 0) params.set('refresh', String(refreshKey));
  const query = params.toString();
  return apiClient.get(`/forecast/demand/${encodeURIComponent(cropName)}${query ? `?${query}` : ''}`);
}

export const DEMAND_SIGNAL_LABELS = {
  opportunity: 'Demand outpacing supply',
  steady: 'Demand met by current supply',
  none: 'No recent buyer demand',
};
