/** Test Case ID: CASE-075 — Forgot Password with Valid Registered Email. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));

import { isValidEmail } from '../../../../src/utils/validators';
import { requestPasswordReset } from '../../../../src/services/authService';

describe('CASE-075: Forgot Password with Valid Registered Email', () => {
  const testCaseId = 'CASE-075';
  const testDescription = 'User requests a password reset using a valid registered email address.';
  const expectedResult = 'The system accepts the email and successfully processes the password reset request.';

  it('submits one reset request and uses the actual success confirmation', async () => {
    const pageSource = fs.readFileSync(path.resolve('src/features/auth/ForgotPasswordPage.jsx'), 'utf8');
    const serviceSource = fs.readFileSync(path.resolve('src/services/authService.js'), 'utf8');
    const email = 'registered@example.com';
    const redirectTo = 'https://harvestlink.dev/reset-password';
    postMock.mockResolvedValueOnce({ sent: true });
    try {
      expect(isValidEmail(email)).toBe(true);
      expect(serviceSource).toContain("apiClient.post('/auth/request-password-reset'");
      expect(pageSource).toContain('setSent(true)');
      expect(pageSource).toContain('A password reset link has been sent to ${email.trim()}. Check your inbox and spam folder.');
      await expect(requestPasswordReset(email, redirectTo)).resolves.toEqual({ sent: true });
      expect(postMock).toHaveBeenCalledWith('/auth/request-password-reset', { email, redirectTo });
      expect(postMock).toHaveBeenCalledTimes(1);
      expect(pageSource).not.toContain('supabase.auth.updateUser');
      expect(pageSource).not.toContain('signInWithPassword');
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The registered fixture email passed validation, the reset API returned success once, and the existing confirmation state was used without changing the password or logging in.');
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
