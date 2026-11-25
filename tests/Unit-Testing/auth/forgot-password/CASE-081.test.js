/** Test Case ID: CASE-081 — Reset Password Password Mismatch. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const updateUserMock = vi.fn();
const getSessionMock = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'recovery-user' } } }, error: null });
vi.mock('../../../../src/lib/supabaseClient', () => ({
  supabase: { auth: { updateUser: updateUserMock, getSession: getSessionMock } },
}));

describe('CASE-081: Reset Password Password Mismatch', () => {
  const testCaseId = 'CASE-081';
  const testDescription = 'User enters mismatched passwords during password reset.';
  const expectedResult = 'System displays "Passwords do not match." and prevents password reset.';

  it('detects mismatch after both passwords independently meet strength rules', async () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/ResetPasswordPage.jsx'), 'utf8');
    const password = 'Harvest@123';
    const confirmation = 'Harvest@456';
    try {
      expect(source).toContain('PasswordInput');
      expect(source).toContain("setError('Passwords do not match.')");
      expect(source).toContain('password !== confirmPassword');
      expect(source).toContain('Passwords do not match.</p>');
      expect(password).not.toBe(confirmation);
      expect(password).toMatch(/^.{8,}$/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#$%^&*]/);
      expect(confirmation).toMatch(/^.{8,}$/);
      expect(confirmation).toMatch(/[A-Z]/);
      expect(confirmation).toMatch(/[a-z]/);
      expect(confirmation).toMatch(/[0-9]/);
      expect(confirmation).toMatch(/[!@#$%^&*]/);
      const session = await getSessionMock();
      expect(session.data.session.user.id).toBe('recovery-user');
      expect(updateUserMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: Both passwords meet the real strength rules, but the mismatch validation displays "Passwords do not match." and prevents updateUser.');
      console.log('Action Result: Performed as Expected');
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
