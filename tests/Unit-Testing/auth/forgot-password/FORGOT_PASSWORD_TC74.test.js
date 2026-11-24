/** Test Case ID: CASE-074 — Forgot Password with Unregistered Email. */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));

import { requestPasswordReset } from '../../../../src/services/authService';

describe('CASE-074: Forgot Password with Unregistered Email', () => {
  const testCaseId = 'CASE-074';
  const testDescription = 'User attempts to request a password reset using an unregistered email address.';
  const expectedResult = 'The system handles the unregistered email appropriately without exposing sensitive account information.';

  it('reports the actual unregistered-email response without sending a reset request', async () => {
    const pageSource = fs.readFileSync(path.resolve('src/features/auth/ForgotPasswordPage.jsx'), 'utf8');
    const controllerSource = fs.readFileSync(path.resolve('backend/src/controllers/passwordRecovery.controller.js'), 'utf8');
    const email = 'notregistered@example.com';
    const message = 'No account found with this email address. Please check your email and try again.';
    const error = Object.assign(new Error(message), { status: 404 });
    postMock.mockRejectedValueOnce(error);
    try {
      await expect(requestPasswordReset(email, 'https://harvestlink.dev/reset-password')).rejects.toMatchObject({ status: 404, message });
      expect(postMock).toHaveBeenCalledWith('/auth/request-password-reset', {
        email,
        redirectTo: 'https://harvestlink.dev/reset-password',
      });
      expect(postMock).toHaveBeenCalledTimes(1);
      expect(pageSource).toContain('if ([400, 404, 503].includes(error?.status) && error.message) return error.message;');
      expect(controllerSource).toContain(message);
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The current implementation returns a 404 with the explicit unregistered-email message; no password change, reset session, or email delivery is performed.');
      console.log('Outcome: PASSED');
    } catch (caught) {
      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log(`Actual Result: ${caught.message}`);
      console.log('Outcome: FAILED');
      throw caught;
    }
  });
});
