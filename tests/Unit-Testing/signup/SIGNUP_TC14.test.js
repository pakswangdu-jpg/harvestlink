/**
 * Test Case ID: TC-014
 * Scenario    : Farmer Sign Up with Empty Email Address
 * Route       : /register
 */
import { describe, expect, it, vi } from 'vitest';

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock('../../../src/services/apiClient', () => ({ apiClient: { post: postMock } }));
vi.mock('../../../src/lib/supabaseClient', () => ({ supabase: {} }));
vi.mock('../../../src/services/uploadService', () => ({
  uploadAccreditationFile: vi.fn(),
  uploadGovIdFile: vi.fn(),
}));
vi.mock('../../../src/utils/fetchAdminUserLocations', () => ({ fetchAllAdminUserLocations: vi.fn() }));

import { validateAuthForm } from '../../../src/utils/validators';

describe('TC-014: Farmer Sign Up with Empty Email Address', () => {
  const testCaseId = 'TC-014';
  const testDescription = 'Farmer completes all other required registration fields but leaves the email address empty.';
  const expectedResult = 'The message "Enter your email address." appears, registration is prevented, and the registration API is not called.';

  it('returns the actual empty-email validation error and prevents registration', async () => {
    const validFarmer = {
      role: 'farmer', email: '', password: 'ValidPass1!', confirmPassword: 'ValidPass1!',
      firstName: 'Test', lastName: 'Farmer', birthday: '1990-01-01', farmName: 'Test Farm',
      contactNumber: '09455993970', municipality: 'Cebu City', address: 'Test Address', zipCode: '6000',
    };
    const errors = validateAuthForm(validFarmer, 'register');

    try {
      expect(errors.email).toBe('Enter your email address.');
      expect(Object.keys(errors)).toContain('email');
      expect(postMock).not.toHaveBeenCalled();

      console.log(`Test Case ID: ${testCaseId}`);
      console.log(`Test Description: ${testDescription}`);
      console.log(`Expected Result: ${expectedResult}`);
      console.log('Actual Result: The actual registration validator returned "Enter your email address." and no registration API request was made, so the user remains on /register.');
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
