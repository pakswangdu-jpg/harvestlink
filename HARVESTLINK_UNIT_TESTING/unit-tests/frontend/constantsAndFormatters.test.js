import { describe, expect, it } from 'vitest';
import {
  CEBU_MUNICIPALITIES, DELIVERY_METHODS, PAYMENT_METHODS, ROLE_DASHBOARDS,
  isLowStock, getExpiryStatus, matchMunicipality, getMunicipalityCoords,
  getProductListingStatusInfo,
} from '../../../src/utils/constants.js';
import {
  formatCurrency, formatDate, formatRelativeTime, formatQuantity,
  cropActionRecommendation, paymentLabel, deliveryMethodLabel,
} from '../../../src/utils/formatters.js';

describe('Constants and presentation formatters', () => {
  it('contains known Cebu municipalities and role dashboards', () => {
    expect(CEBU_MUNICIPALITIES).toContain('Cebu City');
    expect(ROLE_DASHBOARDS.farmer).toBe('/farmer-dashboard');
  });
  it('defines supported payment and delivery methods', () => {
    expect(PAYMENT_METHODS.map((item) => item.value)).toEqual(['gcash', 'cod']);
    expect(DELIVERY_METHODS.map((item) => item.value)).toContain('courier');
  });
  it('calculates stock and expiry presentation states', () => {
    expect(isLowStock(5)).toBe(true);
    expect(isLowStock(0)).toBe(false);
    expect(getProductListingStatusInfo({ status: 'active', quantity: 0 }).value).toBe('out-of-stock');
  });
  it('matches municipalities and returns fallback coordinates', () => {
    expect(matchMunicipality('Near Cebu City')).toBe('Cebu City');
    expect(getMunicipalityCoords('Cebu City')).toBeTruthy();
  });
  it('formats currency, quantity, dates and labels', () => {
    expect(formatCurrency(40)).toContain('40');
    expect(formatQuantity(1.5)).toBe('1.5');
    expect(formatDate('2026-11-19')).not.toBe('Not available');
    expect(formatRelativeTime(null)).toBe('');
  });
  it('maps actions and labels from actual business values', () => {
    expect(cropActionRecommendation({ signal: 'opportunity', harvestSeason: 'Active', marketTrend: 'stable' })).toBe('Harvest');
    expect(paymentLabel('gcash')).toBeTruthy();
    expect(deliveryMethodLabel('buyer_pickup')).toBeTruthy();
  });
  it('handles missing and future expiry dates', () => {
    expect(getExpiryStatus(null)).toBeNull();
    expect(['expiring_soon', null]).toContain(getExpiryStatus('2099-12-31'));
  });
});
