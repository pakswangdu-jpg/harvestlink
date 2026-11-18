import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../backend/src/lib/supabaseClient.js', () => ({
  supabaseAdmin: {
    rpc: vi.fn(),
  },
}));

import { requireRole } from '../../../backend/src/middleware/requireRole.js';
import { shouldCheckAccountInactivity, assertAccountActive } from '../../../backend/src/lib/accountInactivity.js';

describe('Role authorization and account inactivity', () => {
  it('allows an account with an allowed role', () => {
    const next = vi.fn();
    requireRole('farmer', 'admin')({ profile: { role: 'farmer' } }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });
  it('rejects an account with a disallowed role', () => {
    const next = vi.fn();
    requireRole('admin')({ profile: { role: 'buyer' } }, {}, next);
    expect(next.mock.calls[0][0].status).toBe(403);
  });
  it('preflights inactivity only for active marketplace roles', () => {
    expect(shouldCheckAccountInactivity({
      account_status: 'active',
      role: 'buyer',
      created_at: '2020-01-01T00:00:00Z',
    }, Date.now())).toBe(true);
    expect(shouldCheckAccountInactivity({
      account_status: 'suspended',
      role: 'farmer',
      created_at: '2020-01-01T00:00:00Z',
    }, Date.now())).toBe(false);
  });
  it('rejects already suspended profiles', async () => {
    await expect(assertAccountActive({
      account_status: 'suspended',
      role: 'buyer',
      inactivity_suspended_at: null,
    })).rejects.toMatchObject({ status: 403 });
  });
});
