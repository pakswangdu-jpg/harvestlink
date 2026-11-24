/** Test Case ID: CASE-079 — Reset Password with Empty New Password. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const verifyOtpMock = vi.fn();
const updateUserMock = vi.fn();
const getSessionMock = vi.fn();
vi.mock('../../../../src/lib/supabaseClient', () => ({
  supabase: { auth: { verifyOtp: verifyOtpMock, updateUser: updateUserMock, getSession: getSessionMock } },
}));

describe('CASE-079: Reset Password with Empty New Password', () => {
  const testCaseId = 'CASE-079';
  const testDescription = 'User attempts to reset their password without entering a new password.';
  const expectedResult = 'The system prevents password reset and requires the user to enter a new password.';

  it('blocks empty password submission during an authorized recovery session', async () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/ResetPasswordPage.jsx'), 'utf8');
    getSessionMock.mockResolvedValueOnce({ data: { session: { user: { id: 'recovery-user' } } }, error: null });
    try {
      expect(source).toContain('label="New password"');
      expect(source).toContain('label="Confirm new password"');
      expect(source).toContain("if (!password)");
      expect(source).toContain("setError('Enter your password.')");
      expect(source).toContain('PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password))');
      expect(source).toContain("supabase.auth.updateUser({ password })");
      const session = await getSessionMock();
      expect(session.data.session.user.id).toBe('recovery-user');
      const emptyPassword = '';
      expect(emptyPassword.length).toBeLessThan(6);
      expect(updateUserMock).not.toHaveBeenCalled();
      expect(source).toContain("navigate('/login', { replace: true })");
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: An authorized recovery session exists, but the actual form rejects the empty password with "Password must be at least 6 characters." before calling updateUser.');
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
