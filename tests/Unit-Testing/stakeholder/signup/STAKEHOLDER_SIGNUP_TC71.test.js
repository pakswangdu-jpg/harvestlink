/** Test Case ID: CASE-071 — Stakeholder Verification with Valid Resent Code. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock, getMock } = vi.hoisted(() => ({ postMock: vi.fn(), getMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock, get: getMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({
  supabase: { auth: { signInWithPassword: vi.fn().mockResolvedValue({ error: null }), getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'stakeholder-id' } } }) } },
}));

import { resendRegistrationOtp, verifyRegistrationOtp } from '../../../../src/services/authService';

describe('CASE-071: Stakeholder Verification with Valid Resent Code', () => {
  const testCaseId = 'CASE-071';
  const testDescription = 'Stakeholder enters a valid newly resent six-digit verification code.';
  const expectedResult = "The system successfully verifies the Stakeholder's email using the newly resent code.";

  it('resends and verifies the new code once through the real service flow', async () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const serviceSource = fs.readFileSync(path.resolve('src/services/authService.js'), 'utf8');
    const controllerSource = fs.readFileSync(path.resolve('backend/src/controllers/auth.controller.js'), 'utf8');
    const email = 'stakeholder@example.test';
    const resentCode = '654321';
    const storage = new Map([['harvestlink:verification-device-id', 'stakeholder-device-71']]);
    globalThis.localStorage = { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: () => {} };
    postMock.mockResolvedValueOnce({ message: 'Verification code resent.' }).mockResolvedValueOnce({});
    getMock.mockResolvedValueOnce({ id: 'stakeholder-id', role: 'stakeholder', email, email_confirmed_at: 'now' });
    try {
      expect(authSource).toContain('Array.from({ length: OTP_LENGTH }');
      expect(authSource).toContain("setOtpNotice('A new code is on its way.')");
      expect(authSource).toContain("const user = await verifyOtp(otpEmail, otpValue, form.password, pendingFiles)");
      expect(authSource).toContain("if (isStakeholderRegister) {");
      expect(authSource).toContain("setAuthStage('submitted');");
      expect(serviceSource).toContain("/auth/resend-registration-code");
      expect(serviceSource).toContain("/auth/verify-registration-code");
      expect(controllerSource).toContain('email_confirm: true');
      await expect(resendRegistrationOtp(email)).resolves.toBeUndefined();
      await expect(verifyRegistrationOtp(email, resentCode, 'Harvest@123', { role: 'stakeholder' }))
        .resolves.toMatchObject({ id: 'stakeholder-id', email_confirmed_at: 'now' });
      expect(postMock).toHaveBeenNthCalledWith(1, '/auth/resend-registration-code', { email, deviceId: 'stakeholder-device-71' });
      expect(postMock).toHaveBeenNthCalledWith(2, '/auth/verify-registration-code', { email, code: resentCode, deviceId: 'stakeholder-device-71' });
      expect(postMock).toHaveBeenCalledTimes(2);
      expect(resentCode).toHaveLength(6);
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The resent code was delivered, submitted once to verification, and returned an email-verified Stakeholder profile; no invalid or expired error occurred.');
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
