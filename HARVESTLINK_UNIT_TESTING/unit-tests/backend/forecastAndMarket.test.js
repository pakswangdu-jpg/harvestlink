import { describe, expect, it } from 'vitest';
import {
  inferHarvestSeason,
  computeConfidence,
  computeSupplyLevel,
  computeForecastDemand,
  computeStatus,
  computeRiskLevel,
} from '../../../backend/src/lib/forecastEngine.js';
import { calculateFeeForDistance } from '../../../backend/src/lib/deliveryFeeConfig.js';
import { matchCommodity } from '../../../backend/src/lib/marketCommodities.js';

describe('Forecast and market calculations', () => {
  it('infers harvest season from listing count', () => {
    expect(['Active', 'Transitional', 'Off Season']).toContain(inferHarvestSeason(10));
  });
  it('calculates confidence between valid boundaries', () => {
    const confidence = computeConfidence({
      orderCount: 20, activeListings: 5, hasWeather: true, hasTrendData: true, daysAhead: 7,
    });
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(100);
  });
  it('calculates supply, demand, status, and risk', () => {
    expect(['High', 'Moderate', 'Low']).toContain(computeSupplyLevel(5));
    expect(computeForecastDemand('opportunity', 'Active')).toBeTruthy();
    expect(computeStatus('opportunity', null)).toBeTruthy();
    expect(['Low', 'Medium', 'High']).toContain(computeRiskLevel(10, 70));
  });
  it('matches built-in commodities case-insensitively', () => {
    expect(matchCommodity('Fresh cabbage')?.label).toBe('Cabbage');
  });
  it('calculates a non-negative delivery fee', () => {
    const result = calculateFeeForDistance(2);
    expect(result.fee).toBeGreaterThanOrEqual(0);
  });
});
