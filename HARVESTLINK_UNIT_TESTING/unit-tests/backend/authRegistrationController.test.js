import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../backend/src/lib/supabaseClient.js', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      insert: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        single: vi.fn(async () => ({ data: { email: 'buyer@gmail.com' }, error: null })),
      })),
      update: vi.fn().mockReturnThis(),
    })),
  },
}));
vi.mock('../../../backend/src/lib/email.js', () => ({
  sendVerificationCodeEmail: vi.fn(async () => ({ id: 'email-1' })),
}));
vi.mock('../../../backend/src/lib/recaptcha.js', () => ({
  verifyRecaptchaToken: vi.fn(async () => true),
}));

import { register } from '../../../backend/src/controllers/auth.controller.js';

describe('Registration controller', () => {
  it('requires a valid password', async () => {
    await expect(register({ body: { role: 'buyer', email: 'buyer@gmail.com', password: '123' } }, {}))
      .rejects.toMatchObject({ status: 400 });
  });
  it('rejects an unsupported role', async () => {
    await expect(register({ body: { role: 'unknown', email: 'buyer@gmail.com', password: '123456', contactNumber: '09171234567' } }, {}))
      .rejects.toMatchObject({ status: 400 });
  });
});
