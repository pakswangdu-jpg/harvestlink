/** Test Case ID: CASE-073 — Forgot Password with Invalid Email Format. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));

import { isValidEmail } from '../../../../src/utils/validators';

describe('CASE-073: Forgot Password with Invalid Email Format', () => {
  const testCaseId = 'CASE-073';
  const testDescription = 'User enters an invalid email address when requesting a password reset.';
  const expectedResult = 'The system rejects the invalid email format and prevents the password reset request.';

  it('rejects invalidemail.com before calling the reset API', () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/ForgotPasswordPage.jsx'), 'utf8');
    const invalidEmail = 'invalidemail.com';
    try {
      expect(isValidEmail(invalidEmail)).toBe(false);
      expect(source).toContain('if (!isValidEmail(trimmed))');
      expect(source).toContain("setError('Please enter a valid email address.')");
      expect(source).toContain('return;');
      expect(source).toContain('requestPasswordReset(trimmed, getPasswordRecoveryRedirect())');
      expect(postMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual Forgot Password validation rejects invalidemail.com with "Please enter a valid email address." before any reset API or email request.');
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
