import { describe, expect, it } from 'vitest';
import { getAuthDestination, ADMIN_ENTRY_PATH } from '../../../src/utils/authDestination.js';

describe('Auth destinations', () => {
  it('sends users to their role dashboards', () => {
    expect(getAuthDestination('farmer')).toBe('/farmer-dashboard');
    expect(getAuthDestination('buyer')).toBe('/buyer-dashboard');
    expect(getAuthDestination('stakeholder')).toBe('/stakeholder-dashboard');
  });
  it('preserves requested routes except for admin restrictions', () => {
    expect(getAuthDestination('buyer', { from: '/marketplace' })).toBe('/marketplace');
    expect(getAuthDestination('admin')).toBeNull();
  });
  it('allows only admin accounts into the admin entry', () => {
    expect(getAuthDestination('admin', { adminPortal: true })).toBe(ADMIN_ENTRY_PATH);
    expect(getAuthDestination('buyer', { adminPortal: true })).toBeNull();
  });
});
