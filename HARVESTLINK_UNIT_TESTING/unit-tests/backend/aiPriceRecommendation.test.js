import { describe, expect, it } from 'vitest';

function recommend(reference, cost, trendPercent) {
  const adjustment = Math.max(-15, Math.min(20, trendPercent));
  const base = reference * (1 + adjustment / 100);
  const floor = cost ? cost * 1.15 : 0;
  const price = Math.max(base, floor);
  return Math.round(price * 100) / 100;
}

describe('AI/rule-based price recommendation', () => {
  it('returns 45 pesos for a 40 peso market and 12.5 percent trend', () => {
    expect(recommend(40, 20, 12.5)).toBe(45);
  });
  it('raises the price to the profitability floor', () => {
    expect(recommend(40, 50, -12.5)).toBe(57.5);
  });
});
