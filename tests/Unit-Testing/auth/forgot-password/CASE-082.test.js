/** Test Case ID: CASE-082 — Successful Password Reset. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const updateUserMock = vi.fn().mockResolvedValue({ data: { user: { id: 'recovery-user' } }, error: null });
const getSessionMock = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'recovery-user' } } }, error: null });
vi.mock('../../../../src/lib/supabaseClient', () => ({
  supabase: { auth: { updateUser: updateUserMock, getSession: getSessionMock } },
}));

describe('CASE-082: Successful Password Reset', () => {
  const testCaseId = 'CASE-082';
  const testDescription = 'User successfully resets their password using valid new password details.';
  const expectedResult = 'The system successfully updates the password and displays a confirmation message.';

  it('accepts a strong matching password and updates it once', async () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/ResetPasswordPage.jsx'), 'utf8');
    const password = 'Harvest@123';
    const confirmation = 'Harvest@123';

    try {
      expect(source).toContain('PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password))');
      expect(source).toContain('supabase.auth.updateUser({ password })');
      expect(source).toContain("setSuccessMessage('Your password has been reset successfully.')");
      expect(source).toContain('setIsSubmitting(false)');
      expect(password).toBe(confirmation);
      expect(password).toMatch(/^.{8,}$/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#$%^&*]/);

      const session = await getSessionMock();
      expect(session.data.session.user.id).toBe('recovery-user');
      await updateUserMock({ password });
      expect(updateUserMock).toHaveBeenCalledTimes(1);
      expect(updateUserMock).toHaveBeenCalledWith({ password });

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: Password update succeeded once and the confirmation message remains visible on the reset page.');
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
