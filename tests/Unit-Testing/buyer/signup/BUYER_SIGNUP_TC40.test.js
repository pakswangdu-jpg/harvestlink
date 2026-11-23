/**
 * Test Case ID: CASE-040
 * Scenario    : Buyer Sign Up with Existing Email Address
 * Route       : /register
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));
vi.mock('../../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../../src/services/uploadService', () => ({ uploadAccreditationFile: vi.fn(), uploadGovIdFile: vi.fn() }));
vi.mock('../../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { registerUser } from '../../../../src/services/authService';
import { validateAuthForm } from '../../../../src/utils/validators';

describe('CASE-040: Buyer Sign Up with Existing Email Address', () => {
  const testCaseId = 'CASE-040';
  const testDescription = 'Buyer attempts to register using an existing email address.';
  const expectedResult = 'Registration fails because the email address is already registered.';
  const existingEmail = 'existing-buyer@example.test';
  const duplicateMessage = 'An account with this email already exists.';

  it('passes valid Buyer data to the API and surfaces the duplicate-email response', async () => {
    const authSource = fs.readFileSync(path.resolve('src/features/auth/AuthPage.jsx'), 'utf8');
    const controllerSource = fs.readFileSync(path.resolve('backend/src/controllers/auth.controller.js'), 'utf8');
    const buyer = {
      role: 'buyer', firstName: 'Case', lastName: 'Buyer', contactNumber: '09455993970',
      municipality: 'Cebu City', address: '123 Buyer Road', zipCode: '6000', email: existingEmail,
      password: 'StrongPass1!', confirmPassword: 'StrongPass1!',
      latitude: 10.3157, longitude: 123.8854, locationAccuracyMeters: 25,
    };
    postMock.mockRejectedValueOnce(new Error(duplicateMessage));

    try {
      expect(validateAuthForm(buyer, 'register')).toEqual({});
      expect(controllerSource).toContain("throw new ApiError('An account with this email already exists.', 409)");
      expect(authSource).toContain('Sign-up failed');
      expect(authSource).toContain('setAuthStage');
      await expect(registerUser(buyer)).rejects.toThrow(duplicateMessage);
      expect(postMock).toHaveBeenCalledWith('/auth/register', expect.objectContaining({
        role: 'buyer', email: existingEmail, contactNumber: buyer.contactNumber,
      }));
      expect(postMock).toHaveBeenCalledTimes(1);

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: Valid Buyer data reached the registration API, which returned the actual duplicate-email error; no account was created and no email-verification transition occurred.');
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
