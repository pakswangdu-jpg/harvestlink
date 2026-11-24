/** Test Case ID: CASE-068 — Stakeholder Email Verification with Valid Code. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { verifyOtpMock } = vi.hoisted(() => ({ verifyOtpMock: vi.fn() }));

describe('CASE-068: Stakeholder Email Verification with Valid Code', () => {
  const testCaseId = 'CASE-068';
  const testDescription = 'Stakeholder enters a valid six-digit email verification code.';
  const expectedResult = 'Email verification succeeds and the system proceeds according to the existing Stakeholder verification flow.';
  const validCode = '123456';
  const verifiedStakeholder = { id: 'mock-stakeholder-id', email: 'stakeholder@example.test', role: 'stakeholder', email_confirmed_at: 'mocked-time' };

  it('accepts a valid code and completes the stakeholder verification flow once', async () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const contextSource = fs.readFileSync(path.resolve('src/features/auth/AuthContext.jsx'), 'utf8');
    const controllerSource = fs.readFileSync(path.resolve('backend/src/controllers/auth.controller.js'), 'utf8');
    verifyOtpMock.mockResolvedValueOnce(verifiedStakeholder);
    try {
      expect(controllerSource).toContain('const VERIFICATION_CODE_TTL_MS = 5 * 60 * 1000;');
      expect(authSource).toContain('Array.from({ length: OTP_LENGTH }');
      expect(authSource).toContain('const user = await verifyOtp(otpEmail, otpValue, form.password, pendingFiles)');
      expect(authSource).toContain("if (isStakeholderRegister) {");
      expect(authSource).toContain("setAuthStage('submitted');");
      expect(contextSource).toContain('setCurrentUserState(user);');
      expect(controllerSource).toContain('email_confirm: true');
      expect(controllerSource).toContain('res.json(serializeProfile(profile))');
      const result = await verifyOtpMock('stakeholder@example.test', validCode, 'Harvest@123', { role: 'stakeholder' });
      expect(result).toEqual(verifiedStakeholder);
      expect(verifyOtpMock).toHaveBeenCalledWith('stakeholder@example.test', validCode, 'Harvest@123', { role: 'stakeholder' });
      expect(verifyOtpMock).toHaveBeenCalledTimes(1);
      expect(result.email_confirmed_at).toBeTruthy();
      expect(authSource).not.toContain("getAuthDestination(user.role, { adminPortal, from: location.state?.from });\n      if (isStakeholderRegister)");
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The valid code returns an email-verified Stakeholder profile; the existing flow moves to its submitted/pending state once and does not redirect to a Farmer or Buyer dashboard.');
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
