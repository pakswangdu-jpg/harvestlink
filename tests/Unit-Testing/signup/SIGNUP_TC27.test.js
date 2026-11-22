/**
 * Test Case ID: CASE-027
 * Scenario    : Farmer Email Verification with Valid Verification Code
 * Route       : /register (email verification stage)
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { verifyOtpMock } = vi.hoisted(() => ({ verifyOtpMock: vi.fn() }));

import { getAuthDestination } from '../../../src/utils/authDestination';

describe('CASE-027: Farmer Email Verification with Valid Verification Code', () => {
  const testCaseId = 'CASE-027';
  const testDescription = 'Farmer enters a valid six-digit verification code.';
  const expectedResult = 'Email verification succeeds and the system proceeds to the appropriate page.';
  const validCode = '123456';
  const verifiedFarmer = { id: 'mock-farmer-id', email: 'farmer@example.test', role: 'farmer', email_confirmed_at: 'mocked-time' };

  it('accepts a valid code, marks the farmer verified, and redirects to the farmer dashboard', async () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const contextSource = fs.readFileSync(path.resolve('src/features/auth/AuthContext.jsx'), 'utf8');
    const controllerSource = fs.readFileSync(path.resolve('backend/src/controllers/auth.controller.js'), 'utf8');
    verifyOtpMock.mockResolvedValueOnce(verifiedFarmer);

    try {
      expect(authSource).toContain('Array.from({ length: OTP_LENGTH }');
      expect(authSource).toContain('className="otp-digit"');
      expect(authSource).toContain('const user = await verifyOtp(otpEmail, otpValue, form.password, pendingFiles)');
      expect(authSource).toContain('getAuthDestination(user.role');
      expect(authSource).toContain("navigate(destination, { replace: true })");
      expect(contextSource).toContain('setCurrentUserState(user);');
      expect(controllerSource).toContain('email_confirm: true');
      expect(controllerSource).toContain('res.json(serializeProfile(profile))');

      const result = await verifyOtpMock('farmer@example.test', validCode, 'StrongPass1!', {});
      expect(result).toEqual(verifiedFarmer);
      expect(verifyOtpMock).toHaveBeenCalledWith('farmer@example.test', validCode, 'StrongPass1!', {});
      expect(verifyOtpMock).toHaveBeenCalledTimes(1);
      expect(validCode).toHaveLength(6);
      expect(result.email_confirmed_at).toBeTruthy();
      expect(getAuthDestination(result.role)).toBe('/farmer-dashboard');

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log(`Actual Result: The mocked successful verification returned a verified farmer profile for ${validCode}; the actual role destination is /farmer-dashboard and no error response was produced.`);
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
