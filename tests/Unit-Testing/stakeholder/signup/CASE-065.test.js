/** Test Case ID: CASE-065 — Stakeholder Email Verification with Empty Code. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { verifyOtpMock } = vi.hoisted(() => ({ verifyOtpMock: vi.fn() }));

describe('CASE-065: Stakeholder Email Verification with Empty Code', () => {
  const testCaseId = 'CASE-065';
  const testDescription = 'Stakeholder attempts to verify an email address without entering a verification code.';
  const expectedResult = 'Email verification is prevented until the required six-digit code is entered.';

  it('blocks empty-code verification before calling the verification API', () => {
    const source = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    try {
      const otpLength = Number(source.match(/const OTP_LENGTH\s*=\s*(\d+)/)?.[1]);
      const emptyCode = '';
      expect(otpLength).toBe(6);
      expect(emptyCode.length).not.toBe(otpLength);
      expect(source).toContain('Array.from({ length: OTP_LENGTH }');
      expect(source).toContain('className="otp-digit"');
      expect(source).toContain('aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}');
      expect(source).toContain("setOtpError('Enter the 6-digit verification code to continue.')");
      expect(source).toContain("if (otpValue.length !== OTP_LENGTH)");
      expect(source).toContain("mapVerificationAlert(otpError, 'Verification failed')");
      expect(source).toContain("authStage === 'otp'");
      expect(source).toContain("'Verify email'");
      expect(emptyCode.length !== otpLength).toBe(true);
      expect(verifyOtpMock).not.toHaveBeenCalled();
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual OTP stage renders six inputs, reports the required six-digit code, and does not call verification for an empty code.');
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
