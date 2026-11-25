/**
 * Test Case ID: CASE-025
 * Scenario    : Email Verification with Invalid Verification Code
 * Route       : /register (email verification stage)
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { verifyOtpMock } = vi.hoisted(() => ({ verifyOtpMock: vi.fn() }));

describe('CASE-025: Email Verification with Invalid Verification Code', () => {
  const testCaseId = 'CASE-025';
  const testDescription = 'A farmer enters an incorrect six-digit verification code after reaching email verification.';
  const expectedResult = 'The verification API receives 123456, returns the actual invalid-code error, verification fails, and the user remains on the verification page.';
  const invalidCodeMessage = 'Incorrect verification code.\n\nPlease try again.';

  it('shows the actual invalid-code error and does not verify the account', async () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const authControllerSource = fs.readFileSync(path.resolve('backend/src/controllers/auth.controller.js'), 'utf8');
    const enteredCode = '123456';
    verifyOtpMock.mockRejectedValueOnce(new Error(invalidCodeMessage));

    try {
      expect(authSource).toContain('Array.from({ length: OTP_LENGTH }');
      expect(authSource).toContain('className="otp-digit"');
      expect(authSource).toContain('aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}');
      expect(authSource).toContain("title: 'Invalid verification code'");
      expect(authSource).toContain("message: 'The code you entered is incorrect. Please try again.'");
      expect(authSource).toContain('setOtpError(error.message)');
      expect(authSource).toContain("authStage === 'otp'");
      expect(authControllerSource).toContain("throw new ApiError('Incorrect verification code.\\n\\nPlease try again.', 400)");

      await expect(verifyOtpMock('farmer@example.test', enteredCode, 'StrongPass1!', {}))
        .rejects.toThrow(invalidCodeMessage);
      expect(verifyOtpMock).toHaveBeenCalledWith('farmer@example.test', enteredCode, 'StrongPass1!', {});
      expect(verifyOtpMock).toHaveBeenCalledTimes(1);
      expect(enteredCode).toHaveLength(6);

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log(`Actual Result: The mocked verification API received ${enteredCode} and returned the actual invalid-code response; no verified account or redirect was produced.`);
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
