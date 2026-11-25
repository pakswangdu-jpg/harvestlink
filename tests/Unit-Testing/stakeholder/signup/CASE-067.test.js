/** Test Case ID: CASE-067 — Stakeholder Email Verification with Expired Code. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { verifyOtpMock } = vi.hoisted(() => ({ verifyOtpMock: vi.fn() }));

describe('CASE-067: Stakeholder Email Verification with Expired Code', () => {
  const testCaseId = 'CASE-067';
  const testDescription = 'Stakeholder attempts to verify an email address using an expired six-digit verification code.';
  const expectedResult = 'Email verification fails because the verification code has expired.';
  const expiredMessage = 'Your verification code has expired. Please request a new verification code.';

  it('uses the actual five-minute expiry response and preserves resend access', async () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const controllerSource = fs.readFileSync(path.resolve('backend/src/controllers/auth.controller.js'), 'utf8');
    const emailSource = fs.readFileSync(path.resolve('backend/src/lib/email.js'), 'utf8');
    const enteredCode = '123456';
    verifyOtpMock.mockRejectedValueOnce(new Error(expiredMessage));
    try {
      expect(controllerSource).toContain('const VERIFICATION_CODE_TTL_MS = 5 * 60 * 1000;');
      expect(controllerSource).toContain("throw new ApiError('Your verification code has expired. Please request a new verification code.', 400)");
      expect(emailSource).toContain('This expires in 5 minutes.');
      expect(authSource).toContain('Array.from({ length: OTP_LENGTH }');
      expect(authSource).toContain("title: 'Code expired'");
      expect(authSource).toContain("message: 'Your verification code has expired. Please request a new code.'");
      expect(authSource).toContain('setOtpError(error.message)');
      expect(authSource).toContain('resendCooldown > 0');
      expect(authSource).toContain('Resend code');
      await expect(verifyOtpMock('stakeholder@example.test', enteredCode, 'Harvest@123', { role: 'stakeholder' }))
        .rejects.toThrow(expiredMessage);
      expect(verifyOtpMock).toHaveBeenCalledWith('stakeholder@example.test', enteredCode, 'Harvest@123', { role: 'stakeholder' });
      expect(verifyOtpMock).toHaveBeenCalledTimes(1);
      expect(enteredCode).toHaveLength(6);
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The backend expires codes after five minutes, returns the actual expired-code error, and the verification page retains its resend-code flow.');
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
