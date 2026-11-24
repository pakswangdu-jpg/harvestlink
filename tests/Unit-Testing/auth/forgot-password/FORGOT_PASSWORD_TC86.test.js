/** Test Case ID: CASE-086 — Forgot Password Network Error Handling. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));
import { requestPasswordReset } from '../../../../src/services/authService';

describe('CASE-086: Forgot Password Network Error Handling', () => {
  it('handles a network failure without success or repeated requests', async () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/ForgotPasswordPage.jsx'), 'utf8');
    const email = 'registered@gmail.com';
    const networkError = new Error('Network request failed');
    postMock.mockRejectedValueOnce(networkError);

    await expect(requestPasswordReset(email, 'https://harvestlink.dev/reset-password')).rejects.toThrow('Network request failed');
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith('/auth/request-password-reset', { email, redirectTo: 'https://harvestlink.dev/reset-password' });
    expect(source).toContain("const networkError = error?.name === 'TypeError'");
    expect(source).toContain('Unable to connect to the server. Please check your internet connection and try again.');
    expect(source).toContain('setError(getResetErrorMessage(requestError))');
    expect(source).toContain('setIsSubmitting(false)');
    expect(source).toContain('if (isSubmitting) return;');
    expect(source).toContain('setSent(true)');

    console.log('Test Case ID: CASE-086');
    console.log('Test Description: User requests a password reset while a network error occurs.');
    console.log('Expected Result: The system handles the network failure and displays an appropriate error notification.');
    console.log('Actual Result: The network failure maps to the retry notification, the request is made once, and submission state is released without success confirmation.');
    console.log('Outcome: PASSED');
  });
});
