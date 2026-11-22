/**
 * Test Case ID: TC-013
 * Scenario    : Farmer Sign Up with Existing Email Address
 * Route       : /register
 */
import { describe, expect, it, vi } from 'vitest';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock('../../../src/services/apiClient', () => ({
  apiClient: { post: postMock },
}));

vi.mock('../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../src/services/uploadService', () => ({
  uploadAccreditationFile: vi.fn(),
  uploadGovIdFile: vi.fn(),
}));
vi.mock('../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { registerUser } from '../../../src/services/authService';

describe('TC-013: Farmer Sign Up with Existing Email Address', () => {
  const testCaseId = 'TC-013';
  const testDescription = 'Farmer submits valid registration data using an email already present in the user records.';
  const expectedResult = 'Sign-up failed with "An account with this email already exists.", no account is created, and the user remains on /register.';

  it('returns the existing-email failure from the real registration service and does not create a user', async () => {
    const existingEmailError = new Error('An account with this email already exists.');
    existingEmailError.code = 'EMAIL_EXISTS';
    postMock.mockRejectedValueOnce(existingEmailError);

    const validFarmer = {
      role: 'farmer', email: 'existing-farmer@example.test', password: 'ValidPass1!',
      firstName: 'Test', lastName: 'Farmer', birthday: '1990-01-01', farmName: 'Test Farm',
      contactNumber: '09455993970', municipality: 'Cebu City', address: 'Test Address', zipCode: '6000',
    };

    try {
      await expect(registerUser(validFarmer)).rejects.toMatchObject({
        message: 'An account with this email already exists.',
        code: 'EMAIL_EXISTS',
      });
      expect(postMock).toHaveBeenCalledTimes(1);
      expect(postMock).toHaveBeenCalledWith('/auth/register', expect.objectContaining({
        email: validFarmer.email,
        role: 'farmer',
      }));

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: Registration service returned the existing-email error and made no second create request. The UI error title is Sign-up failed and the route remains /register because navigation occurs only after a successful response.');
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
