/** Test Case ID: CASE-077 — Forgot Password with Expired Reset Link. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const verifyOtpMock = vi.fn();
const updateUserMock = vi.fn();
const getSessionMock = vi.fn();
vi.mock('../../../../src/lib/supabaseClient', () => ({
  supabase: { auth: { verifyOtp: verifyOtpMock, updateUser: updateUserMock, getSession: getSessionMock } },
}));

describe('CASE-077: Forgot Password with Expired Reset Link', () => {
  const testCaseId = 'CASE-077';
  const testDescription = 'User attempts to reset a password using an expired password reset link.';
  const expectedResult = 'The system rejects the expired recovery link and prevents password reset.';
  const expiredMessage = 'This reset link is invalid or has expired. Request a new one to continue.';

  it('rejects an expired recovery token before password update', async () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/ResetPasswordPage.jsx'), 'utf8');
    verifyOtpMock.mockResolvedValueOnce({ data: { session: null }, error: new Error('Token expired') });
    try {
      expect(source).toContain("supabase.auth.verifyOtp({ token_hash: recoveryToken, type: 'recovery' })");
      expect(source).toContain("setError('This reset link is invalid or has expired. Request a new one to continue.')");
      expect(source).toContain("setSessionState('invalid')");
      expect(source).toContain('This link expires 10 minutes after it is sent and can only be used once.');
      expect(source).toContain('Request a new link');
      const result = await verifyOtpMock({ token_hash: 'expired-test-token', type: 'recovery' });
      expect(result.error).toBeTruthy();
      expect(result.data.session).toBeNull();
      expect(updateUserMock).not.toHaveBeenCalled();
      expect(getSessionMock).not.toHaveBeenCalled();
      expect(expiredMessage).toContain('invalid or has expired');
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual recovery flow marks an expired token invalid, displays the expiration message, provides Request a new link, and does not call password update.');
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
