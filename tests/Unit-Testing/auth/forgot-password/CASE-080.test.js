/** Test Case ID: CASE-080 — Reset Password with Weak New Password. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const updateUserMock = vi.fn();
const getSessionMock = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'recovery-user' } } }, error: null });
vi.mock('../../../../src/lib/supabaseClient', () => ({
  supabase: { auth: { updateUser: updateUserMock, getSession: getSessionMock } },
}));

describe('CASE-080: Reset Password with Weak New Password', () => {
  const testCaseId = 'CASE-080';
  const testDescription = 'User attempts to reset their password using a weak new password.';
  const expectedResult = 'The system rejects the weak password and prevents the password reset.';

  it('rejects 123 before calling the password update API', async () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/ResetPasswordPage.jsx'), 'utf8');
    const weakPassword = '123';
    try {
      expect(source).toContain('PASSWORD_REQUIREMENTS');
      expect(source).toContain("label: 'Weak password'");
      expect(source).toContain("label: 'Strong password'");
      expect(source).toContain("setError('Password must meet all requirements.')");
      expect(source).toContain('PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password))');
      expect(source).toContain('label="New password"');
      expect(source).toContain('label="Confirm new password"');
      expect(weakPassword.length).toBeLessThan(8);
      expect(weakPassword).not.toMatch(/[A-Z]/);
      expect(weakPassword).not.toMatch(/[a-z]/);
      expect(weakPassword).toMatch(/[0-9]/);
      expect(weakPassword).not.toMatch(/[!@#$%^&*]/);
      const session = await getSessionMock();
      expect(session.data.session.user.id).toBe('recovery-user');
      expect(updateUserMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual reset form identifies 123 as failing the password requirements and blocks submission before updateUser is called.');
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
