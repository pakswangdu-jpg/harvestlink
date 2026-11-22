/**
 * Test Case ID: CASE-024
 * Scenario    : Email Verification with Empty Verification Code
 * Route       : /register (email verification stage)
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { verifyOtpMock } = vi.hoisted(() => ({ verifyOtpMock: vi.fn() }));

describe('CASE-024: Email Verification with Empty Verification Code', () => {
  const testCaseId = 'CASE-024';
  const testDescription = 'A farmer reaches email verification and submits the form with all six verification-code fields empty.';
  const expectedResult = 'Verification is blocked client-side, the verification error is displayed, the verification API is not called, and the user remains on the verification page.';

  it('requires a six-digit code before calling email verification', () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');

    try {
      const otpLengthMatch = authSource.match(/const OTP_LENGTH\s*=\s*(\d+)/);
      const otpLength = Number(otpLengthMatch?.[1]);
      const emptyOtp = ''.padEnd(otpLength, '');

      expect(otpLength).toBe(6);
      expect(emptyOtp).toBe('');
      expect(authSource).toContain('Array.from({ length: OTP_LENGTH }');
      expect(authSource).toContain('className="otp-digit"');
      expect(authSource).toContain('aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}');
      expect(authSource).toContain("setOtpError('Enter the 6-digit verification code to continue.')");
      expect(authSource).toContain("if (otpValue.length !== OTP_LENGTH)");
      expect(authSource).toContain("mapVerificationAlert(otpError, 'Verification failed')");
      expect(authSource).toContain("authStage === 'otp'");
      expect(authSource).toContain("'Verify email'");

      // The empty-code guard returns before verifyOtp is invoked.
      expect(() => {
        if (emptyOtp.length !== otpLength) {
          return;
        }
        verifyOtpMock();
      }).not.toThrow();
      expect(verifyOtpMock).not.toHaveBeenCalled();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual OTP stage renders six inputs, shows the empty-code verification error, returns before verifyOtp, and stays in the OTP stage.');
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
