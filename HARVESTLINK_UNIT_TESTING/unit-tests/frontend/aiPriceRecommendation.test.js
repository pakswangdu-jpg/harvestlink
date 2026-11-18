import { describe, expect, it } from 'vitest';

function calculate(reference, cost, trendPercent) {
  const adjustment = Math.max(-15, Math.min(20, trendPercent));
  let recommendation = reference * (1 + adjustment / 100);
  if (cost) recommendation = Math.max(recommendation, cost * 1.15);
  return {
    price: Math.round(recommendation * 100) / 100,
    profit: cost ? Math.round((recommendation - cost) * 100) / 100 : null,
  };
}

describe('AI price recommendation formula', () => {
  it('calculates a +12.5% market adjustment', () => {
    expect(calculate(40, 20, 12.5)).toEqual({ price: 45, profit: 25 });
  });
  it('never recommends below the profitability floor', () => {
    expect(calculate(40, 50, -12.5).price).toBeGreaterThanOrEqual(57.5);
  });
  it('bounds positive and negative trend adjustments', () => {
    expect(calculate(40, 20, 100).price).toBe(48);
    expect(calculate(40, 20, -100).price).toBe(34);
  });
});
