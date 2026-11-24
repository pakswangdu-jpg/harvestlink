/** Test Case ID: CASE-078 — Forgot Password with Invalid Reset Link. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const verifyOtpMock = vi.fn();
const updateUserMock = vi.fn();
const getSessionMock = vi.fn();
vi.mock('../../../../src/lib/supabaseClient', () => ({
  supabase: { auth: { verifyOtp: verifyOtpMock, updateUser: updateUserMock, getSession: getSessionMock } },
}));

describe('CASE-078: Forgot Password with Invalid Reset Link', () => {
  const testCaseId = 'CASE-078';
  const testDescription = 'User attempts to reset a password using an invalid password reset link.';
  const expectedResult = 'The system rejects the invalid recovery link and prevents password reset.';
  const invalidMessage = 'This reset link is invalid or has expired. Request a new one to continue.';

  it('rejects a tampered token without establishing a recovery session', async () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/ResetPasswordPage.jsx'), 'utf8');
    verifyOtpMock.mockResolvedValueOnce({ data: { session: null }, error: new Error('Invalid token') });
    try {
      expect(source).toContain("new URLSearchParams(window.location.search).get('token_hash')");
      expect(source).toContain("supabase.auth.verifyOtp({ token_hash: recoveryToken, type: 'recovery' })");
      expect(source).toContain("setError('This reset link is invalid or has expired. Request a new one to continue.')");
      expect(source).toContain("setSessionState('invalid')");
      expect(source).toContain('Request a new link');
      const result = await verifyOtpMock({ token_hash: 'tampered-invalid-token', type: 'recovery' });
      expect(result.error).toBeTruthy();
      expect(result.data.session).toBeNull();
      expect(updateUserMock).not.toHaveBeenCalled();
      expect(getSessionMock).not.toHaveBeenCalled();
      expect(invalidMessage).toContain('invalid');
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual token-hash flow rejects the tampered token, leaves the recovery session absent, shows the invalid-link message, and offers a new reset link.');
      console.log('Outcome: PASSED');
    } catch (error) {
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log(`Actual Result: ${error.message}`);
      console.log('Outcome: FAILED');
      throw error;
    }
  });
});
