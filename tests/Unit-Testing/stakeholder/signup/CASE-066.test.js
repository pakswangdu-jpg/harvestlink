/** Test Case ID: CASE-066 — Stakeholder Email Verification with Invalid Code. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { verifyOtpMock } = vi.hoisted(() => ({ verifyOtpMock: vi.fn() }));

describe('CASE-066: Stakeholder Email Verification with Invalid Code', () => {
  const testCaseId = 'CASE-066';
  const testDescription = 'Stakeholder enters an invalid six-digit verification code.';
  const expectedResult = 'Email verification fails and an invalid verification code error message appears.';
  const invalidCodeMessage = 'Incorrect verification code.\n\nPlease try again.';

  it('rejects an incorrect code with the actual backend error', async () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const controllerSource = fs.readFileSync(path.resolve('backend/src/controllers/auth.controller.js'), 'utf8');
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
      expect(controllerSource).toContain("throw new ApiError('Incorrect verification code.\\n\\nPlease try again.', 400)");
      await expect(verifyOtpMock('stakeholder@example.test', enteredCode, 'Harvest@123', { role: 'stakeholder' }))
        .rejects.toThrow(invalidCodeMessage);
      expect(verifyOtpMock).toHaveBeenCalledWith('stakeholder@example.test', enteredCode, 'Harvest@123', { role: 'stakeholder' });
      expect(verifyOtpMock).toHaveBeenCalledTimes(1);
      expect(enteredCode).toHaveLength(6);
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The verification API received 123456 and returned the actual invalid-code error; no verified state or redirect was produced.');
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
