import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../backend/src/lib/supabaseClient.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    })),
    auth: { admin: { getUserById: vi.fn(), generateLink: vi.fn() } },
  },
}));
vi.mock('../../../backend/src/lib/email.js', () => ({
  sendPasswordResetEmail: vi.fn(async () => ({ id: 'email-1' })),
}));

import { requestPasswordReset } from '../../../backend/src/controllers/passwordRecovery.controller.js';

describe('Password recovery controller', () => {
  it('rejects malformed email addresses', async () => {
    await expect(requestPasswordReset({
      body: { email: 'invalid', redirectTo: 'https://harvestlink.dev/reset-password' },
    }, {})).rejects.toMatchObject({ status: 400 });
  });
  it('rejects unknown accounts without sending email', async () => {
    await expect(requestPasswordReset({
      body: { email: 'unknown@gmail.com', redirectTo: 'https://harvestlink.dev/reset-password' },
    }, {})).rejects.toMatchObject({ status: 404 });
  });
});
