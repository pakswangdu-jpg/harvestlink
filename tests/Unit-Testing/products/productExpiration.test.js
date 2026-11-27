import { describe, expect, it } from 'vitest';
import {
  getDaysUntilExpiration,
  getExpiryStatus,
  getProductExpirationInfo,
  getProductStatusInfo,
  getTodayInPhilippines,
  isProductExpired,
  isProductExpiringSoon,
} from '../../../src/utils/constants';

describe('Product expiration logic (Asia/Manila timezone)', () => {
  // 2026-11-28T16:30:00Z is 2026-11-29 00:30:00 in Asia/Manila (UTC+8)
  const manilaMidnightNextDay = new Date('2026-11-28T16:30:00.000Z');

  it('calculates today strictly in Philippine timezone (Asia/Manila)', () => {
    expect(getTodayInPhilippines(manilaMidnightNextDay)).toBe('2026-11-29');
    expect(getDaysUntilExpiration('2026-11-28', manilaMidnightNextDay)).toBe(-1);
    expect(getDaysUntilExpiration('2026-11-29', manilaMidnightNextDay)).toBe(0);
    expect(getDaysUntilExpiration('2026-12-02', manilaMidnightNextDay)).toBe(3);
    expect(getDaysUntilExpiration('2026-12-03', manilaMidnightNextDay)).toBe(4);
  });

  it('handles missing expiration dates as Not specified', () => {
    const info = getProductExpirationInfo(null, manilaMidnightNextDay);
    expect(info.status).toBe('none');
    expect(info.formattedDate).toBe('Not specified');
    expect(info.isExpired).toBe(false);
    expect(info.isExpiringSoon).toBe(false);
    expect(getExpiryStatus(null, manilaMidnightNextDay)).toBeNull();
  });

  it('classifies fresh (>3 days), expiring soon (0-3 days), and expired (<0 days)', () => {
    const fresh = getProductExpirationInfo('2026-12-05', manilaMidnightNextDay);
    expect(fresh.status).toBe('fresh');
    expect(fresh.daysRemaining).toBe(6);
    expect(fresh.detailText).toBe('6 days left');
    expect(fresh.isExpired).toBe(false);
    expect(fresh.isExpiringSoon).toBe(false);

    const soon3 = getProductExpirationInfo('2026-12-02', manilaMidnightNextDay);
    expect(soon3.status).toBe('expiring-soon');
    expect(soon3.indicatorText).toBe('Expiring Soon');
    expect(soon3.detailText).toBe('3 days left');
    expect(isProductExpiringSoon('2026-12-02', manilaMidnightNextDay)).toBe(true);

    const today = getProductExpirationInfo('2026-11-29', manilaMidnightNextDay);
    expect(today.status).toBe('expiring-soon');
    expect(today.detailText).toBe('Expires today');
    expect(isProductExpired('2026-11-29', manilaMidnightNextDay)).toBe(false);

    const expired = getProductExpirationInfo('2026-11-28', manilaMidnightNextDay);
    expect(expired.status).toBe('expired');
    expect(expired.indicatorText).toBe('Expired');
    expect(expired.isExpired).toBe(true);
    expect(isProductExpired('2026-11-28', manilaMidnightNextDay)).toBe(true);
    expect(getExpiryStatus('2026-11-28', manilaMidnightNextDay)).toBe('expired');
  });

  it('applies expiration status consistently to Retail and Wholesale products', () => {
    const retailSoon = {
      status: 'active',
      quantity: 25,
      sellingType: 'retail',
      expirationDate: '2026-12-01',
    };
    const wholesaleSoon = {
      status: 'active',
      quantity: 100,
      sellingType: 'wholesale',
      moq: 20,
      expirationDate: '2026-11-29',
    };
    const wholesaleExpired = {
      status: 'active',
      quantity: 100,
      sellingType: 'wholesale',
      moq: 20,
      expirationDate: '2026-11-28',
    };
    const retailFresh = {
      status: 'active',
      quantity: 25,
      sellingType: 'retail',
      expirationDate: '2026-12-10',
    };
    const outOfStockNotExpired = {
      status: 'active',
      quantity: 0,
      sellingType: 'retail',
      expirationDate: '2026-12-01',
    };

    expect(getProductStatusInfo(retailSoon, manilaMidnightNextDay)).toEqual({
      value: 'expiring-soon',
      label: 'Expiring Soon',
    });
    expect(getProductStatusInfo(wholesaleSoon, manilaMidnightNextDay)).toEqual({
      value: 'expiring-soon',
      label: 'Expiring Soon',
    });
    expect(getProductStatusInfo(wholesaleExpired, manilaMidnightNextDay)).toEqual({
      value: 'expired',
      label: 'Expired',
    });
    expect(getProductStatusInfo(retailFresh, manilaMidnightNextDay)).toEqual({
      value: 'active',
      label: 'Active',
    });
    expect(getProductStatusInfo(outOfStockNotExpired, manilaMidnightNextDay)).toEqual({
      value: 'out-of-stock',
      label: 'Out of stock',
    });
  });
});
