/** Test Case ID: CASE-076 — Forgot Password Reset Link Successfully Sent. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));

import { requestPasswordReset } from '../../../../src/services/authService';

describe('CASE-076: Forgot Password Reset Link Successfully Sent', () => {
  const testCaseId = 'CASE-076';
  const testDescription = 'User requests a password reset link using a registered email address.';
  const expectedResult = 'The system successfully processes the request and displays a reset link confirmation message.';

  it('shows the actual confirmation state after one successful request', async () => {
    const pageSource = fs.readFileSync(path.resolve('src/features/auth/ForgotPasswordPage.jsx'), 'utf8');
    const serviceSource = fs.readFileSync(path.resolve('src/services/authService.js'), 'utf8');
    const email = 'registered@example.com';
    const redirectTo = 'https://harvestlink.dev/reset-password';
    postMock.mockResolvedValueOnce({ sent: true });
    try {
      expect(pageSource).toContain('setSent(true)');
      expect(pageSource).toContain('A password reset link has been sent to ${email.trim()}. Check your inbox and spam folder.');
      expect(pageSource).toContain('Check your inbox and spam folder.');
      expect(serviceSource).toContain("apiClient.post('/auth/request-password-reset'");
      await expect(requestPasswordReset(email, redirectTo)).resolves.toEqual({ sent: true });
      expect(postMock).toHaveBeenCalledWith('/auth/request-password-reset', { email, redirectTo });
      expect(postMock).toHaveBeenCalledTimes(1);
      expect(pageSource).not.toContain('supabase.auth.updateUser');
      expect(pageSource).not.toContain('signInWithPassword');
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The reset request succeeded once and the actual page confirmation tells the user to check their inbox and spam folder; no login or password change occurs.');
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
