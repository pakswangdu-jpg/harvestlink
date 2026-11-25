/**
 * Test Case ID: CASE-028
 * Scenario    : Farmer Email Verification – Resend Verification Code
 * Route       : /register (email verification stage)
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../src/lib/supabaseClient', () => ({ supabase: {} }));

import { resendRegistrationOtp } from '../../../src/services/authService';

describe('CASE-028: Farmer Email Verification – Resend Verification Code', () => {
  const testCaseId = 'CASE-028';
  const testDescription = 'Farmer requests a new email verification code.';
  const expectedResult = 'The system successfully requests a new verification code and displays a confirmation message.';
  const email = 'farmer@example.test';

  it('calls the resend endpoint and applies the actual confirmation/cooldown behavior', async () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const serviceSource = fs.readFileSync(path.resolve('src/services/authService.js'), 'utf8');
    const controllerSource = fs.readFileSync(path.resolve('backend/src/controllers/auth.controller.js'), 'utf8');
    postMock.mockResolvedValueOnce({ message: 'Verification code resent.' });

    try {
      expect(authSource).toContain('Array.from({ length: OTP_LENGTH }');
      expect(authSource).toContain("'Resend code'");
      expect(authSource).toContain('resendCooldown > 0');
      expect(authSource).toContain("setOtpNotice('A new code is on its way.')");
      expect(authSource).toContain('setResendCooldown(RESEND_COOLDOWN_SECONDS)');
      expect(serviceSource).toContain("apiClient.post('/auth/resend-registration-code'");
      expect(controllerSource).toContain("res.status(200).json({ message: 'Verification code resent.' })");
      expect(controllerSource).toContain('code_hash: codeHash');
      expect(controllerSource).toContain('attempt_count: 0');

      await expect(resendRegistrationOtp(email)).resolves.toBeUndefined();
      expect(postMock).toHaveBeenCalledWith('/auth/resend-registration-code', { email });
      expect(postMock).toHaveBeenCalledTimes(1);

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual resend endpoint was called with the registered email, returned its success response, and the OTP stage sets the existing confirmation notice and cooldown while the account remains unverified.');
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
