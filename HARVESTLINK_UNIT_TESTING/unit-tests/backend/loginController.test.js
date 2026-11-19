import { describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithPassword: vi.fn(async () => ({
        data: { session: { access_token: 'access', refresh_token: 'refresh' }, user: { id: 'u1' } },
        error: null,
      })),
    },
  })),
}));
vi.mock('../../../backend/src/lib/supabaseClient.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({
        data: { id: 'u1', role: 'buyer', account_status: 'active', inactivity_suspended_at: null },
        error: null,
      })),
    })),
  },
}));
vi.mock('../../../backend/src/lib/accountInactivity.js', () => ({
  assertAccountActive: vi.fn(async () => true),
}));
vi.mock('../../../backend/src/lib/recaptcha.js', () => ({
  verifyRecaptchaToken: vi.fn(async () => true),
}));

import { login } from '../../../backend/src/controllers/login.controller.js';

describe('Login controller', () => {
  it('rejects missing credentials', async () => {
    await expect(login({ body: {}, path: '/auth/login' }, {}))
      .rejects.toMatchObject({ status: 400 });
  });
});
