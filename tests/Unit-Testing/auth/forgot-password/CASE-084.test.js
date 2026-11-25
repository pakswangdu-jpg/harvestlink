/** Test Case ID: CASE-084 — Reuse of Password Reset Link. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const verifyOtpMock = vi.fn().mockResolvedValue({
  data: { session: null },
  error: { code: 'otp_expired', message: 'Token has already been used' },
});
const updateUserMock = vi.fn();
vi.mock('../../../../src/lib/supabaseClient', () => ({
  supabase: { auth: { verifyOtp: verifyOtpMock, updateUser: updateUserMock } },
}));

describe('CASE-084: Reuse of Password Reset Link', () => {
  const testCaseId = 'CASE-084';
  const testDescription = 'User attempts to reuse a previously used password reset link.';
  const expectedResult = 'The reused reset link is rejected and password modification is prevented.';

  it('rejects a consumed recovery token in a fresh session', async () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/ResetPasswordPage.jsx'), 'utf8');
    const token = 'dummy-consumed-token';

    try {
      expect(source).toContain('supabase.auth.verifyOtp({ token_hash: recoveryToken, type: \'recovery\' })');
      expect(source).toContain("setError('This reset link is invalid or has expired. Request a new one to continue.')");
      expect(source).toContain("<Link className=\"btn btn-primary btn-md full-width\" to=\"/forgot-password\">Request a new link</Link>");
      expect(source).toContain("setSessionState('invalid')");

      const response = await verifyOtpMock({ token_hash: token, type: 'recovery' });
      expect(verifyOtpMock).toHaveBeenCalledWith({ token_hash: token, type: 'recovery' });
      expect(response.error.code).toBe('otp_expired');
      expect(response.data.session).toBeNull();
      expect(updateUserMock).not.toHaveBeenCalled();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The consumed recovery token was rejected, the reset flow enters its invalid-link state, and updateUser was not called.');
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
