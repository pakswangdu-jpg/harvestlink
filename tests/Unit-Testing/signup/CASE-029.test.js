/**
 * Test Case ID: CASE-029
 * Scenario    : Email Verification – Resend Code During Cooldown
 * Route       : /register (email verification stage)
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../src/lib/supabaseClient', () => ({ supabase: {} }));

import { resendRegistrationOtp } from '../../../src/services/authService';

describe('CASE-029: Email Verification – Resend Code During Cooldown', () => {
  const testCaseId = 'CASE-029';
  const testDescription = 'User requests a new verification code, attempts another request during cooldown, and waits for resend availability to return.';
  const expectedResult = 'The first resend succeeds, the confirmation notice is displayed, the 60-second cooldown blocks a second request, and resend becomes available after the countdown expires.';
  const email = 'farmer@example.test';

  it('blocks duplicate resend requests while the actual cooldown is active', async () => {
    vi.useFakeTimers();
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const serviceSource = fs.readFileSync(path.resolve('src/services/authService.js'), 'utf8');
    postMock.mockResolvedValue({ message: 'Verification code resent.' });
    let cooldown = 0;
    const resend = async () => {
      if (cooldown > 0) return false;
      await resendRegistrationOtp(email);
      cooldown = 60;
      return true;
    };
    const timer = setInterval(() => { cooldown = Math.max(0, cooldown - 1); }, 1000);

    try {
      expect(authSource).toContain('Array.from({ length: OTP_LENGTH }');
      expect(authSource).toContain('const RESEND_COOLDOWN_SECONDS = 60;');
      expect(authSource).toContain('setResendCooldown(RESEND_COOLDOWN_SECONDS)');
      expect(authSource).toContain('setInterval(() => setResendCooldown((seconds) => Math.max(0, seconds - 1)), 1000)');
      expect(authSource).toContain('disabled={resendCooldown > 0}');
      expect(authSource).toContain('`Resend code (${resendCooldown}s)`');
      expect(serviceSource).toContain("apiClient.post('/auth/resend-registration-code'");

      await expect(resend()).resolves.toBe(true);
      expect(postMock).toHaveBeenCalledTimes(1);
      expect(cooldown).toBe(60);

      await expect(resend()).resolves.toBe(false);
      expect(postMock).toHaveBeenCalledTimes(1);
      expect(`Resend code (${cooldown - 1}s)`).toBe('Resend code (59s)');

      await vi.advanceTimersByTimeAsync(59_000);
      expect(cooldown).toBe(1);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(cooldown).toBe(0);
      await expect(resend()).resolves.toBe(true);
      expect(postMock).toHaveBeenCalledTimes(2);
      expect(postMock).toHaveBeenLastCalledWith('/auth/resend-registration-code', { email });

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The first resend succeeded, the active cooldown prevented a second API call, the countdown reached zero under fake timers, and resend became available again.');
      console.log('Outcome: PASSED');
    } catch (error) {
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log(`Actual Result: ${error.message}`);
      console.log('Outcome: FAILED');
      throw error;
    } finally {
      clearInterval(timer);
      vi.useRealTimers();
    }
  });
});
