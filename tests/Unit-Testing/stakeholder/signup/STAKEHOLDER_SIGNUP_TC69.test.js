/** Test Case ID: CASE-069 — Stakeholder Email Verification Resend. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));

import { resendRegistrationOtp } from '../../../../src/services/authService';

describe('CASE-069: Stakeholder Email Verification Resend', () => {
  const testCaseId = 'CASE-069';
  const testDescription = 'Stakeholder requests a new six-digit email verification code.';
  const expectedResult = 'The system successfully requests a new verification code and displays a confirmation message.';
  const email = 'stakeholder@example.test';

  it('calls resend once with the registered email and device identity', async () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const serviceSource = fs.readFileSync(path.resolve('src/services/authService.js'), 'utf8');
    const controllerSource = fs.readFileSync(path.resolve('backend/src/controllers/auth.controller.js'), 'utf8');
    const storage = new Map([['harvestlink:verification-device-id', 'stakeholder-device-69']]);
    globalThis.localStorage = { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
    postMock.mockResolvedValueOnce({ message: 'Verification code resent.' });
    try {
      expect(authSource).toContain('Array.from({ length: OTP_LENGTH }');
      expect(authSource).toContain("const RESEND_COOLDOWN_SECONDS = 60;");
      expect(authSource).toContain("setOtpNotice('A new code is on its way.')");
      expect(authSource).toContain('setResendCooldown(RESEND_COOLDOWN_SECONDS)');
      expect(authSource).toContain('resendCooldown > 0');
      expect(serviceSource).toContain("apiClient.post('/auth/resend-registration-code'");
      expect(serviceSource).toContain('deviceId');
      expect(controllerSource).toContain("res.status(200).json({ message: 'Verification code resent.' })");
      await expect(resendRegistrationOtp(email)).resolves.toBeUndefined();
      expect(postMock).toHaveBeenCalledWith('/auth/resend-registration-code', { email, deviceId: 'stakeholder-device-69' });
      expect(postMock).toHaveBeenCalledTimes(1);
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The resend endpoint accepted the Stakeholder email and device ID; the OTP view uses its actual confirmation notice and 60-second cooldown without verifying the account.');
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
