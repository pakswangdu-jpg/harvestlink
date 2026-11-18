import { describe, expect, it } from 'vitest';
import {
  inferHarvestSeason, computeConfidence, computeSupplyLevel,
  computeSeasonalImpact, computeForecastDemand, computeStatus,
  computeRiskLevel, buildRecommendation,
} from '../../../backend/src/lib/forecastEngine.js';

describe('Backend forecast engine', () => {
  it('maps listing count to harvest seasons', () => {
    expect(inferHarvestSeason(0)).toBe('Off Season');
    expect(inferHarvestSeason(2)).toBe('Transitional');
    expect(inferHarvestSeason(5)).toBe('Active');
  });
  it('bounds confidence to 35-95', () => {
    expect(computeConfidence({ orderCount: 0, activeListings: 0, daysAhead: 365 })).toBeGreaterThanOrEqual(35);
    expect(computeConfidence({ orderCount: 100, activeListings: 100, hasWeather: true, hasTrendData: true, daysAhead: 1 })).toBeLessThanOrEqual(95);
  });
  it('calculates supply and demand levels', () => {
    expect(computeSupplyLevel(0)).toBe('Low');
    expect(computeForecastDemand('opportunity', 'Off Season')).toBe('Very High');
  });
  it('provides seasonal and risk explanations', () => {
    expect(computeSeasonalImpact('Active')).toContain('Active harvest season');
    expect(computeStatus('opportunity', null)).toBe('High Opportunity');
    expect(computeRiskLevel(8, 70)).toBe('High');
  });
  it('builds a crop recommendation from actual signals', () => {
    expect(buildRecommendation({ crop: 'Cabbage', signal: 'opportunity', harvestSeason: 'Active', forecastPrice: 50, currentPrice: 40 }))
      .toContain('Cabbage');
  });
});
