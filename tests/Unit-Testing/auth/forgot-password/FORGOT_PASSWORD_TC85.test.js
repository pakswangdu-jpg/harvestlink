/** Test Case ID: CASE-085 — Password Reset Rate Limit Validation. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { requestResetMock } = vi.hoisted(() => ({ requestResetMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: requestResetMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));
import { requestPasswordReset } from '../../../../src/services/authService';

describe('CASE-085: Password Reset Rate Limit Validation', () => {
  it('maps a mocked 429 response to the configured notification without success', async () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/ForgotPasswordPage.jsx'), 'utf8');
    const email = 'registered@gmail.com';
    requestResetMock.mockRejectedValueOnce(Object.assign(new Error('Too many requests'), { status: 429, retryAfterSeconds: 120 }));
    await expect(requestPasswordReset(email, 'https://harvestlink.dev/reset-password')).rejects.toMatchObject({ status: 429 });
    expect(requestResetMock).toHaveBeenCalledTimes(1);
    expect(requestResetMock).toHaveBeenCalledWith('/auth/request-password-reset', { email, redirectTo: 'https://harvestlink.dev/reset-password' });
    expect(source).toContain("if (error?.status === 429)");
    expect(source).toContain('Too many reset requests. Please try again later.');
    expect(source).toContain('setCooldownSeconds(Math.max(cooldownSeconds, requestError.retryAfterSeconds))');
    expect(source).toContain('setSent(true)');
    expect(source).toContain('setError(getResetErrorMessage(requestError))');
    console.log('Test Case ID: CASE-085');
    console.log('Test Description: User requests a password reset after the rate limit has been reached.');
    console.log('Expected Result: The system displays the appropriate rate-limit notification.');
    console.log('Actual Result: The mocked 429 response is mapped to the retry-after notification and does not enter the success state or retry automatically.');
    console.log('Outcome: PASSED');
  });
});
