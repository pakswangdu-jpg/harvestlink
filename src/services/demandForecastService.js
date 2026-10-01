import { apiClient } from './apiClient';





export async function getDemandForecast({
  category = '', municipality = '', daysBack = 180, period = '', customDate = '',
} = {}) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  if (municipality) params.set('municipality', municipality);
  if (daysBack) params.set('daysBack', String(daysBack));
  if (period) params.set('period', period);
  if (period === 'custom' && customDate) params.set('customDate', customDate);
  const query = params.toString();
  return apiClient.get(`/forecast/demand${query ? `?${query}` : ''}`);
}





export function getCropForecastDetail(cropName, { period = '', municipality = '', customDate = '' } = {}) {
  const params = new URLSearchParams();
  if (period) params.set('period', period);
  if (municipality) params.set('municipality', municipality);
  if (period === 'custom' && customDate) params.set('customDate', customDate);
  const query = params.toString();
  return apiClient.get(`/forecast/demand/${encodeURIComponent(cropName)}${query ? `?${query}` : ''}`);
}

export const DEMAND_SIGNAL_LABELS = {
  opportunity: 'Demand outpacing supply',
  steady: 'Demand met by current supply',
  none: 'No recent buyer demand',
};
