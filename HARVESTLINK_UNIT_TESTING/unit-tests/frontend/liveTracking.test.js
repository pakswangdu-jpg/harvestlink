import { describe, expect, it } from 'vitest';
import { haversineKm } from '../../../src/utils/geo.js';

describe('Live tracking distance', () => {
  it('returns zero for identical coordinates', () => {
    expect(haversineKm({ lat: 10.3157, lng: 123.8854 }, { lat: 10.3157, lng: 123.8854 })).toBe(0);
  });
  it('rejects missing coordinates', () => {
    expect(haversineKm(null, { lat: 10, lng: 123 })).toBeNull();
  });
});
